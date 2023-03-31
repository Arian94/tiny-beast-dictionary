import { invoke } from '@tauri-apps/api';
import { readText } from '@tauri-apps/api/clipboard';
import { listen } from '@tauri-apps/api/event';
import { appWindow, PhysicalPosition } from '@tauri-apps/api/window';
import React, { BaseSyntheticEvent, MutableRefObject, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CountriesAbbrs } from '../models/countries';
import { INIT_DICT as INIT_DICT_MSG, OfflineDictAbbrs, OfflineDictsList, OfflineTranslation } from '../models/offline-mode';
import { OnlineTranslation } from '../models/online.mode';
import styles from './Translation.module.scss';

export type TranslationCompOutput = {
    translate: () => void,
    langSwapped: () => void,
    translationTextareaRef: MutableRefObject<string | OnlineTranslation | OfflineTranslation>,
}

const SEARCHING_TRANS = "searching...";

export const Translation = React.forwardRef(({
    activeTabRef,
    fromRef,
    toRef,
    selectedOfflineDictRef,
    shouldTranslateClipboardRef,
    _shouldTranslateSelectedTextRef,
    offlineDictsList,
    emitNewConfig,
}: {
    activeTabRef: MutableRefObject<"online" | "offline">,
    fromRef: MutableRefObject<CountriesAbbrs | "auto">,
    toRef: MutableRefObject<CountriesAbbrs>,
    selectedOfflineDictRef: MutableRefObject<OfflineDictAbbrs | undefined>,
    shouldTranslateClipboardRef: MutableRefObject<boolean>,
    _shouldTranslateSelectedTextRef: MutableRefObject<boolean>,
    offlineDictsList: OfflineDictsList,
    emitNewConfig(selectedOfflineDict?: OfflineDictAbbrs | null, downloadedDicts?: OfflineDictAbbrs[]): Promise<void>,
}, ref: ((instance: any) => void) | MutableRefObject<TranslationCompOutput | null> | null) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const isSpeaking = useRef(false);
    const timeout = useRef<number>();
    const fieldsetRef = useRef<HTMLDivElement>(null);
    const translationTextareaRef = useRef<string | OnlineTranslation | OfflineTranslation>('');

    let clipboardBuffer: string;

    const invokeBackend = async (word: string) => {
        try {
            if (activeTabRef.current === 'online') {
                const from = fromRef.current, to = toRef.current;
                const d = await invoke<OnlineTranslation>('online_translate', { from, to, word });
                if (word === inputRef.current?.value && from === fromRef.current && to === toRef.current) {
                    translationTextareaRef.current = d;
                    setLoading(false);
                }
            } else {
                if (!selectedOfflineDictRef.current) return;
                if (!offlineDictsList[selectedOfflineDictRef.current].isBootUp) {
                    offlineDictsList[selectedOfflineDictRef.current].isBootUp = true;
                    translationTextareaRef.current = INIT_DICT_MSG;
                }
                translationTextareaRef.current = await invoke<OfflineTranslation>('offline_translate', { word, lang: selectedOfflineDictRef.current });
                setLoading(false);
            }
        } catch (er: unknown) {
            translationTextareaRef.current = (!!er && typeof er === 'object' && 'message' in er) ? er.message as string : er as string;
            setLoading(false);
        }
    }

    const search = async (word: string | undefined) => {
        if (!word?.trim()) return inputCleared(translationTextareaRef.current === SEARCHING_TRANS);
        if (!translationTextareaRef.current) translationTextareaRef.current = SEARCHING_TRANS;
        setLoading(true);
        await invokeBackend(word);
        fieldsetRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const inputCleared = (clearTransText: boolean) => {
        if (inputRef.current) inputRef.current.value = '';
        if (clearTransText) translationTextareaRef.current = '';
        setLoading(false);
    }

    function inputSpeakHandler(this: HTMLInputElement, e: KeyboardEvent) {
        if (e.code !== 'Enter') return;
        if (e.ctrlKey) return;
        if (activeTabRef.current === 'online' && fromRef.current === 'fa') return;
        if (activeTabRef.current === 'offline' && selectedOfflineDictRef.current === 'fa') return;

        const { value } = this;
        speak(value, activeTabRef.current === 'online' ? fromRef.current : selectedOfflineDictRef.current || 'auto');
    }

    function focusInHandler(this: HTMLInputElement) {
        setTimeout(() => this.select())
    }

    const speak = (word = '', lang: CountriesAbbrs | 'auto') => {
        if (isSpeaking.current) return;
        isSpeaking.current = true;
        invoke<void>('speak', { word, lang }).then(() => isSpeaking.current = false);
    }

    const onInputVal = (event: BaseSyntheticEvent<MouseEvent, HTMLInputElement, HTMLInputElement>) => {
        const { value } = event.target;
        timeout.current !== undefined && clearTimeout(timeout.current);
        timeout.current = setTimeout(() => { search(value) }, 700);
    }

    useImperativeHandle<any, TranslationCompOutput>(ref, () => ({
        translate() {
            search(inputRef.current?.value);
        },
        langSwapped() {
            const tr = (translationTextareaRef.current as OnlineTranslation).google ?? inputRef.current?.value;
            if (inputRef.current) inputRef.current.value = tr;
            search(tr);
        },
        translationTextareaRef,
    }), []);

    useEffect(() => {
        inputRef.current?.addEventListener('keypress', inputSpeakHandler);
        inputRef.current?.addEventListener('focusin', focusInHandler);

        const readClipboardAndTrim = (clip: string | null) => {
            const trimmed = clip?.trim();
            if (!trimmed) return;
            if (trimmed === clipboardBuffer) return;
            if (trimmed.search(/[{}\[\]<>]/) >= 0) return;

            clipboardBuffer = trimmed;
            return trimmed
        }

        // run readText once to store/read clipboard content which may exist before opening the app. 
        readText().then(clip => clipboardBuffer = clip?.trim() ?? '');
        const appFocus = appWindow.onFocusChanged(async ({ payload: isFocused }) => {
            appWindow.emit('app_focus', isFocused);
            if (!isFocused) return;
            inputRef.current?.select();
            if (!shouldTranslateClipboardRef.current) return;
            const clip = await readText()
            const trimmed = readClipboardAndTrim(clip);
            if (!trimmed) return;
            if (inputRef.current) inputRef.current.value = trimmed;
            setLoading(true);
            setTimeout(() => search(trimmed), 100);
        });

        const translateClipboardListener = listen<boolean[]>('tray_settings',
            ({ payload }) => {
                shouldTranslateClipboardRef.current = payload[0];
                _shouldTranslateSelectedTextRef.current = payload[1];
                emitNewConfig();
            });

        const translateSelectedTextListener = listen<string>('text_selected', async ({ payload: text }) => {
            if (!text) return;
            if (inputRef.current) inputRef.current.value = text;
            setLoading(true);
            setTimeout(() => search(text), 100);
            const pos = await appWindow.outerPosition();
            await appWindow.setPosition(new PhysicalPosition(pos.x, pos.y - 36));         // neccessary as appWindow.show() forgets the position.
            await appWindow.isVisible() ? appWindow.unminimize() : appWindow.show();
        });

        function translationSpeakHandler(e: KeyboardEvent) {
            if (!translationTextareaRef.current) return;
            if (toRef.current === 'fa') return;
            if (e.code !== 'Enter' || !e.ctrlKey) return;
            if (activeTabRef.current === 'offline') return;
            speak((translationTextareaRef.current as OnlineTranslation).google, toRef.current);
        }
        window.addEventListener('keypress', translationSpeakHandler);

        return () => {
            inputRef.current?.removeEventListener('keypress', inputSpeakHandler);
            inputRef.current?.removeEventListener('focusin', focusInHandler);
            appFocus.then(d => d());
            translateSelectedTextListener.then(d => d());
            translateClipboardListener.then(d => d());
            window.removeEventListener('keypress', translationSpeakHandler);
        }
    }, []);

    const renderOnlineTranslations = () => {
        if (typeof translationTextareaRef.current === 'string' || !('google' in translationTextareaRef.current)) return;

        const { google, sentencedict, mymemory } = translationTextareaRef.current;

        const mymemoryTrans = mymemory.map(({ accuracy, segment: word, translation }) =>
            <div className={styles.definitions} style={{ marginBlock: ".5rem", backgroundColor: "rgb(var(--primary), .2)" }} key={word + translation}>
                <div><span style={{ color: "rgb(var(--sky))" }}>Word:</span> {word}</div>
                <div><span style={{ color: "rgb(var(--sky))" }}>Translation:</span> {translation}</div>
                <small><span style={{ color: "rgb(var(--sky))" }}>Accuracy:</span> {(accuracy * 100).toFixed()}%</small>
            </div>
        )

        if (sentencedict === 'not found') {
            return <div className={styles.onlineMode}>
                <h3 style={{ color: "mediumvioletred" }}>Google:</h3>
                <div className={styles.google}
                    style={{
                        direction: activeTabRef.current === 'online' && (toRef.current === 'fa' || toRef.current === 'ar') ? 'rtl' : 'ltr',
                    }}
                >
                    {google}
                </div>
                {!!mymemory.length && <><h3 style={{ color: "mediumvioletred" }}>Other Source:</h3>
                    <div>
                        {mymemoryTrans}
                    </div>
                </>
                }
            </div>
        }

        const dom = new DOMParser().parseFromString(sentencedict, "text/html");
        const body = dom.getElementsByTagName('body')[0];
        const imageId = dom.getElementById("imageId");
        const script = dom.getElementsByTagName("script")[0];

        imageId && body.removeChild(imageId);
        script && body.removeChild(script);
        const definition = body.firstChild;
        definition && body.removeChild(definition);
        let defStr = definition?.textContent;
        defStr = defStr?.replace("Antonym:", "<strong>Antonym:</strong>");
        defStr = defStr?.replace("Synonym:", "<strong>Synonym:</strong>");
        defStr = defStr?.replace("Similar words:", "<strong>Similar words:</strong>");
        defStr = defStr?.replace("Meaning:", "<strong>Meaning:</strong>");

        const ad = dom.getElementById("ad_marginbottom_0");
        ad && body.querySelector("#all")?.removeChild(ad);

        const divs = body.querySelector("#all")?.getElementsByTagName('div');
        body.querySelector("#all")?.childNodes.forEach((c, i) => {
            const anchor = divs?.[i]?.getElementsByTagName('a')?.[0];
            anchor && divs?.[i].removeChild(anchor);
        });

        const examples = body.getElementsByTagName('div')[0].innerHTML;

        return (
            <div className={styles.onlineMode}>
                <h3>Google:</h3>
                <div className={styles.google}
                    style={{
                        direction: activeTabRef.current === 'online' && (toRef.current === 'fa' || toRef.current === 'ar') ? 'rtl' : 'ltr',
                    }}
                >
                    {google}
                </div>
                <h3>Other Sources:</h3>
                {mymemoryTrans}
                <hr />
                <h4 style={{ color: "rgb(var(--warning), .8)", fontStyle: "italic", fontSize: ".9rem" }}>Gathered from Websites:</h4>
                <div className={styles.definitions} dangerouslySetInnerHTML={{ __html: defStr ?? "" }}></div>
                <h4>Examples:</h4>
                <div className={styles.examples} dangerouslySetInnerHTML={{ __html: examples }}></div>
            </div>
        )
    }

    const renderOfflineTranslations = () => {
        if (typeof translationTextareaRef.current === 'string' || !('pos' in translationTextareaRef.current)) return;
        return (
            <div className={styles.offlineMode}>
                <h3>Position:</h3>
                <div className={styles.pos}>{translationTextareaRef.current.pos}</div>
                <h3>Senses:</h3>
                <div className={styles.senses}>
                    {translationTextareaRef.current.senses.map(s => {
                        return <div key={s.glosses.join('')}>
                            {!!s.categories?.length && <p key={s.categories[0].name}><span>Categories:</span> {s.categories.map(c => c.name).join(", ")}</p>}
                            <p><span>Glosses:</span> {s.glosses.join(' ')}</p>
                            {s.tags && <p><span>Tags:</span> {s.tags.join(', ')}</p>}
                            {!!s.form_of?.length && <p><span>Form of:</span> {s.form_of[0].word} </p>}
                            {!!s.alt_of?.length && <p><span>Alternative of:</span> {s.alt_of[0].word} </p>}
                            {!!s.examples?.length && <div>
                                <h4>Examples:</h4>
                                {s.examples.map(e => {
                                    return <div key={e.text} className={styles.examples}>
                                        {e.text && <p><span>Text:</span> {e.text}</p>}
                                        {e.english && <p><span>English:</span> {e.english}</p>}
                                        {e.type && <p><span>Type:</span> {e.type}</p>}
                                        {e.ref && <p><span>Reference:</span> {e.ref}</p>}
                                    </div>
                                })}
                            </div>}
                            <hr />
                        </div>
                    })}
                </div>

                {translationTextareaRef.current.etymology_text && <div>
                    <h3 key="ety text">Etymology text:</h3>
                    <div className={styles.definitions}>{translationTextareaRef.current.etymology_text}</div>
                </div>}
                {translationTextareaRef.current.etymology_templates && !!translationTextareaRef.current.etymology_templates.length && <div>
                    <h3 key="ety temp">Etymology templates:</h3>
                    <div className={styles.definitions}>
                        {translationTextareaRef.current.etymology_templates.filter(et => et.expansion).map(et => et.expansion).join(", ")}
                    </div>
                </div>}
            </div>
        )
    }

    const offlineTranslations = useMemo(() => renderOfflineTranslations(), [translationTextareaRef.current]);
    const onlineTranslations = useMemo(() => renderOnlineTranslations(), [translationTextareaRef.current]);

    const isLatin = useMemo(() => (function () {
        return (activeTabRef.current === 'online' && fromRef.current !== 'fa' && fromRef.current !== 'ar') ||
            (activeTabRef.current === 'offline' && selectedOfflineDictRef.current !== 'fa' && selectedOfflineDictRef.current !== 'ar');
    })(), [activeTabRef.current, fromRef.current, selectedOfflineDictRef.current]);

    const isFa = useMemo(() => (function () {
        return (activeTabRef.current === 'online' && fromRef.current === 'fa') || (activeTabRef.current === 'offline' && selectedOfflineDictRef.current === 'fa');
    })(), [activeTabRef.current, fromRef.current, selectedOfflineDictRef.current]);

    return (
        <>
            <div className={styles.input}>
                <input ref={inputRef} autoFocus maxLength={256} disabled={translationTextareaRef.current === INIT_DICT_MSG}
                    placeholder={isFa ? 'جستجو...' : 'search...'}
                    onInput={onInputVal}
                    style={{
                        direction: isLatin ? 'ltr' : 'rtl',
                        fontFamily: isLatin ? 'inherit' : 'Noto Naskh',
                        fontSize: isLatin ? '' : '15px',
                        paddingInlineEnd: '3.6rem',
                    }} />
                <button
                    title="Press Enter"
                    onClick={() => speak(inputRef.current?.value, activeTabRef.current === 'online' ? fromRef.current : selectedOfflineDictRef.current || 'auto')}
                    style={{
                        opacity: !inputRef.current?.value || isFa ? .5 : 1,
                        left: isLatin ? '2px' : 'unset',
                        right: isLatin ? 'unset' : '2px',
                        transform: isLatin ? 'unset' : 'scaleX(-1)'
                    }}
                    disabled={!inputRef.current?.value || isFa}>
                </button>
                <div className={styles.searchErase}
                    style={{
                        flexFlow: isLatin ? 'row wrap' : 'row-reverse wrap',
                        left: isLatin ? 'unset' : '2px',
                        right: isLatin ? '2px' : 'unset'
                    }}>
                    <button className="glow-animation" onClick={() => search(inputRef.current?.value)}></button>
                    <button className="glow-animation" disabled={loading && activeTabRef.current === 'offline'} onClick={() => inputCleared(translationTextareaRef.current === SEARCHING_TRANS)}></button>
                </div>
            </div>
            <fieldset className={styles.translation}
                style={{ opacity: loading ? .5 : 1, }}>
                <div className={styles.legend}>
                    Translation
                    <button
                        title="Press CTRL + Enter"
                        className="glow-animation"
                        onClick={() => speak((translationTextareaRef.current as OnlineTranslation).google, toRef.current)}
                        style={{ display: loading || !translationTextareaRef.current || toRef.current === 'fa' || activeTabRef.current === 'offline' ? 'none' : 'block' }}
                    >
                    </button>
                </div>
                {typeof translationTextareaRef.current === 'string' ? translationTextareaRef.current :
                    <div ref={fieldsetRef} className={styles.transContainer}>
                        {onlineTranslations}
                        {offlineTranslations}
                    </div>
                }
            </fieldset>
        </>
    );
})