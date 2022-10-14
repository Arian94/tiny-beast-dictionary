import { createRef, MutableRefObject, useEffect } from 'react';
import { CountriesAbbrs } from '../types/countries';
import { INIT_DICT, OfflineDictAbbrs, OfflineTranslation } from '../types/offline-mode';
import styles from './Translation.module.scss';

export function Translation({
    activeTabRef,
    fromRef,
    toRef,
    selectedOfflineDictRef,
    speak,
    translationRef,
    inputVal,
    setInputVal,
    loading
}: {
    activeTabRef: MutableRefObject<"online" | "offline">,
    fromRef: MutableRefObject<CountriesAbbrs | "auto">,
    toRef: MutableRefObject<CountriesAbbrs>,
    selectedOfflineDictRef: MutableRefObject<OfflineDictAbbrs | undefined>,
    speak: (word: string, lang: CountriesAbbrs | 'auto') => void,
    translationRef: MutableRefObject<string | OfflineTranslation>,
    inputVal: string,
    setInputVal: React.Dispatch<React.SetStateAction<string>>,
    loading: boolean
}) {
    function inputSpeakHandler(this: HTMLInputElement, e: KeyboardEvent) {
        if (e.code !== 'Enter') return;
        if (e.ctrlKey) return;
        if (activeTabRef.current === 'online' && fromRef.current === 'fa') return;
        if (activeTabRef.current === 'offline' && selectedOfflineDictRef.current === 'fa') return;

        const { value } = this;
        speak(value, activeTabRef.current === 'online' ? fromRef.current : selectedOfflineDictRef.current || 'auto');
    }

    const inputRef = createRef<HTMLInputElement>();

    useEffect(() => {
        inputRef.current?.addEventListener('keypress', inputSpeakHandler);

        return () => {
            inputRef.current?.removeEventListener('keypress', inputSpeakHandler);
        }
    }, []);

    const renderOfflineTranslations = () => {
        if (typeof translationRef.current === 'string') return;
        return (
            <div className={styles.offlineMode}>
                <h3>Position:</h3>
                <div className={styles.pos}>{translationRef.current.pos}</div>
                <h3>Senses:</h3>
                <div className={styles.senses}>
                    {translationRef.current.senses.map(s => {
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

                {translationRef.current.etymology_text && <div>
                    <strong key="ety text">Etymology text:</strong> {translationRef.current.etymology_text}
                </div>}
                {translationRef.current.etymology_templates && !!translationRef.current.etymology_templates.length && <div>
                    <strong key="ety temp">Etymology templates:</strong> {translationRef.current.etymology_templates.filter(et => et.expansion).map(et => et.expansion).join(", ")}
                </div>}
            </div>
        )
    }

    return (
        <>
            <div className={styles.input}>
                <input ref={inputRef} autoFocus maxLength={256} disabled={translationRef.current === INIT_DICT}
                    placeholder={(activeTabRef.current === 'online' && fromRef.current === 'fa') || (activeTabRef.current === 'offline' && selectedOfflineDictRef.current === 'fa') ? 'جستجو...' : 'search...'}
                    value={inputVal} onInput={event => setInputVal(event.currentTarget.value)}
                    style={{
                        direction: (activeTabRef.current === 'online' && (fromRef.current === 'fa' || fromRef.current === 'ar')) || (activeTabRef.current === 'offline' && (selectedOfflineDictRef.current === 'fa' || selectedOfflineDictRef.current === 'ar')) ? 'rtl' : 'ltr',
                        fontFamily: (activeTabRef.current === 'online' && (fromRef.current === 'fa' || fromRef.current === 'ar')) || (activeTabRef.current === 'offline' && (selectedOfflineDictRef.current === 'fa' || selectedOfflineDictRef.current === 'ar')) ? 'Noto Naskh' : 'inherit',
                        fontSize: (activeTabRef.current === 'online' && (fromRef.current === 'fa' || fromRef.current === 'ar')) || (activeTabRef.current === 'offline' && (selectedOfflineDictRef.current === 'fa' || selectedOfflineDictRef.current === 'ar')) ? '15px' : ''
                    }} />
                <button
                    title="Press Enter"
                    onClick={() => speak(inputVal, activeTabRef.current === 'online' ? fromRef.current : selectedOfflineDictRef.current || 'auto')}
                    style={{
                        opacity: !inputVal || (activeTabRef.current === 'online' && fromRef.current === 'fa') || (activeTabRef.current === 'offline' && selectedOfflineDictRef.current === 'fa') ? .5 : 1,
                        left: (activeTabRef.current === 'online' && fromRef.current !== 'fa' && fromRef.current !== 'ar') || (activeTabRef.current === 'offline' && selectedOfflineDictRef.current !== 'fa' && selectedOfflineDictRef.current !== 'ar') ? '2px' : 'unset',
                        right: (activeTabRef.current === 'online' && fromRef.current !== 'fa' && fromRef.current !== 'ar') || (activeTabRef.current === 'offline' && selectedOfflineDictRef.current !== 'fa' && selectedOfflineDictRef.current !== 'ar') ? 'unset' : '2px',
                        transform: (activeTabRef.current === 'online' && (fromRef.current === 'fa' || fromRef.current === 'ar')) || (activeTabRef.current === 'offline' && (selectedOfflineDictRef.current === 'fa' || selectedOfflineDictRef.current === 'ar')) ? 'scaleX(-1)' : 'unset'
                    }}
                    disabled={!inputVal || (activeTabRef.current === 'online' && fromRef.current === 'fa') || (activeTabRef.current === 'offline' && selectedOfflineDictRef.current === 'fa')}>
                </button>
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
                        onClick={() => speak(translationRef.current as string, toRef.current)}
                        style={{ display: !translationRef.current || toRef.current === 'fa' || activeTabRef.current === 'offline' ? 'none' : 'block' }}
                    >
                    </button>
                </legend>
                {typeof translationRef.current === 'string' ? translationRef.current : renderOfflineTranslations()}
            </fieldset>
        </>
    );
}