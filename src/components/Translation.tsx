import { invoke } from '@tauri-apps/api';
import { readText } from '@tauri-apps/api/clipboard';
import { listen } from '@tauri-apps/api/event';
import { appWindow, PhysicalPosition } from '@tauri-apps/api/window';
import React, { BaseSyntheticEvent, createRef, MutableRefObject, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CountriesAbbrs } from '../types/countries';
import { INIT_DICT as INIT_DICT_MSG, OfflineDictAbbrs, OfflineDictsList, OfflineTranslation } from '../types/offline-mode';
import styles from './Translation.module.scss';

export type TranslationCompOutput = {
    translate: () => void,
    langSwapped: () => void,
    translationTextareaRef: MutableRefObject<string | OfflineTranslation>,
}

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
    const inputRef = createRef<HTMLInputElement>();
    const [inputVal, setInputVal] = useState("");
    const [loading, setLoading] = useState<boolean>(false);
    const isSpeaking = useRef(false);
    const timeout = useRef<number>();
    const translationTextareaRef = useRef<string | OfflineTranslation>('');

    let clipboardBuffer: string;

    const handler = (word: string | undefined) => {
        if (!word?.trim()) return;
        setLoading(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        invokeBackend(word);
    };

    const invokeBackend = async (word: string) => {
        let translationVal: string | OfflineTranslation;
        try {
            if (activeTabRef.current === 'online') {
                translationVal = await invoke<string>('online_translate', { from: fromRef.current, to: toRef.current, word });
            } else {
                if (selectedOfflineDictRef.current) {
                    if (!offlineDictsList[selectedOfflineDictRef.current].isBootUp) {
                        offlineDictsList[selectedOfflineDictRef.current].isBootUp = true;
                        translationTextareaRef.current = INIT_DICT_MSG;
                    }
                    translationVal = await invoke<OfflineTranslation>('offline_translate', { word, lang: selectedOfflineDictRef.current });
                } else {
                    translationVal = '';
                }
            }
        } catch (er: any) {
            translationVal = er;
        }
        translationTextareaRef.current = translationVal
        setLoading(false)
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

    const speak = (word: string | undefined, lang: CountriesAbbrs | 'auto') => {
        if (isSpeaking.current) return;
        isSpeaking.current = true;
        invoke<void>('speak', { word, lang }).then(() => isSpeaking.current = false);
    }

    const onInputVal = (event: BaseSyntheticEvent<MouseEvent, HTMLInputElement, HTMLInputElement>) => {
        const { value } = event.target;
        setInputVal(value);
        timeout.current !== undefined && clearTimeout(timeout.current);
        timeout.current = setTimeout(() => { handler(value) }, 700);
    }

    useImperativeHandle<any, TranslationCompOutput>(ref, () => ({
        translate() {
            handler(inputVal);
        },
        langSwapped() {
            setInputVal(translationTextareaRef.current as string);
            handler(translationTextareaRef.current as string);
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
            setInputVal(trimmed);
            return trimmed
        }

        // run readText once to store/read clipboard content which may exist before opening the app. 
        readText().then(clip => clipboardBuffer = clip?.trim() ?? '');
        const appFocus = appWindow.onFocusChanged(({ payload: isFocused }) => {
            appWindow.emit('app_focus', isFocused);
            if (!isFocused) return;
            if (!shouldTranslateClipboardRef.current) return;
            readText().then(clip => { handler(readClipboardAndTrim(clip) ?? "") });
        });

        const translateClipboardListener = listen<boolean[]>('tray_settings',
            ({ payload }) => {
                shouldTranslateClipboardRef.current = payload[0];
                _shouldTranslateSelectedTextRef.current = payload[1];
                emitNewConfig();
            });

        const translateSelectedTextListener = listen<string>('text_selected', async ({ payload: text }) => {
            setInputVal(text);
            handler(text)
            const pos = await appWindow.outerPosition();
            await appWindow.setPosition(new PhysicalPosition(pos.x, pos.y - 36));         // neccessary as appWindow.show() forgets the position.
            await appWindow.isVisible() ? appWindow.unminimize() : appWindow.show();
        });

        function translationSpeakHandler(e: KeyboardEvent) {
            if (!translationTextareaRef.current) return;
            if (toRef.current === 'fa') return;
            if (e.code !== 'Enter' || !e.ctrlKey) return;
            if (activeTabRef.current === 'offline') return;
            speak(translationTextareaRef.current as string, toRef.current);
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

    const renderOfflineTranslations = () => {
        if (typeof translationTextareaRef.current === 'string') return;
        return (
            <div className={styles.offlineMode}>
                <h3>Position:</h3>
                <div className={styles.pos}>{translationTextareaRef.current.pos}</div>
                <h3>Senses:</h3>
                <div className={styles.senses}>
                    {translationTextareaRef.current.senses.map(s => {
                        return <div key={s.glosses.join('')}>
                            {!!s.categories?.length && <p key={s.categories[0].name}>Categories: {s.categories.map(c => c.name).join(", ")}</p>}
                            <p>Glosses: {s.glosses.join(' ')}</p>
                            {s.tags && <p>Tags: {s.tags.join(', ')}</p>}
                            {!!s.form_of?.length && <p >Form of: {s.form_of[0].word} </p>}
                            {!!s.alt_of?.length && <p >Alternative of: {s.alt_of[0].word} </p>}
                            {!!s.examples?.length && <div>
                                <strong >Examples:</strong>
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
                    <strong key="ety text">Etymology text:</strong> {translationTextareaRef.current.etymology_text}
                </div>}
                {translationTextareaRef.current.etymology_templates && !!translationTextareaRef.current.etymology_templates.length && <div>
                    <strong key="ety temp">Etymology templates:</strong> {translationTextareaRef.current.etymology_templates.filter(et => et.expansion).map(et => et.expansion).join(", ")}
                </div>}
            </div>
        )
    }

    const offlineTranslations = useMemo(() => renderOfflineTranslations(), [translationTextareaRef.current]);

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
                    value={inputVal} onInput={onInputVal}
                    style={{
                        direction: isLatin ? 'ltr' : 'rtl',
                        fontFamily: isLatin ? 'inherit' : 'Noto Naskh',
                        fontSize: isLatin ? '' : '15px',
                        paddingInlineEnd: '3.6rem',
                    }} />
                <button
                    title="Press Enter"
                    className="glow-animation"
                    onClick={() => speak(inputVal, activeTabRef.current === 'online' ? fromRef.current : selectedOfflineDictRef.current || 'auto')}
                    style={{
                        opacity: !inputVal || isFa ? .5 : 1,
                        left: isLatin ? '2px' : 'unset',
                        right: isLatin ? 'unset' : '2px',
                        transform: isLatin ? 'unset' : 'scaleX(-1)'
                    }}
                    disabled={!inputVal || isFa}>
                </button>
                <div className={styles.searchErase}
                    style={{
                        flexFlow: isLatin ? 'row wrap' : 'row-reverse wrap',
                        left: isLatin ? 'unset' : '2px',
                        right: isLatin ? '2px' : 'unset'
                    }}>
                    <button className="glow-animation" onClick={() => handler(inputVal)}></button>
                    <button className="glow-animation" onClick={() => setInputVal('')}></button>
                </div>
            </div>
            <fieldset className={styles.translation}
                style={{
                    direction: activeTabRef.current === 'online' && (toRef.current === 'fa' || toRef.current === 'ar') ? 'rtl' : 'ltr',
                    opacity: loading ? .5 : 1,
                }}>
                <legend>
                    Translation
                    <button
                        title="Press CTRL + Enter"
                        className="glow-animation"
                        onClick={() => speak(translationTextareaRef.current as string, toRef.current)}
                        style={{ display: !translationTextareaRef.current || toRef.current === 'fa' || activeTabRef.current === 'offline' ? 'none' : 'block' }}
                    >
                    </button>
                </legend>
                {typeof translationTextareaRef.current === 'string' ? translationTextareaRef.current : offlineTranslations}
            </fieldset>
        </>
    );
})