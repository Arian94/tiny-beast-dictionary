import { readText } from '@tauri-apps/api/clipboard';
import { emit, listen, once } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import { createRef, MutableRefObject, useEffect, useRef, useState } from 'react';
import styles from './App.module.scss';
import { onlineDictionaries } from './countries';
import { Modal, NOT_DOWNLOADED } from './Modal';
import { OfflineDictAbbrs, OfflineDictsList, offlineTranslation } from './models';

type CountriesNames = keyof typeof onlineDictionaries;
type CountriesAbbrs = typeof onlineDictionaries[CountriesNames];
type SavedConfig = {
  activeTab: 'online' | 'offline';
  from: CountriesAbbrs | 'auto';
  to: CountriesAbbrs;
  selectedOfflineDict?: OfflineDictAbbrs;
  downloadedDicts?: OfflineDictAbbrs[];
  x: number;
  y: number;
}
type DownloadStatus = { name: OfflineDictAbbrs; percentage: number };

function App() {
  const [inputVal, setInputVal] = useState("");
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');
  const activeTabRef = useRef<'online' | 'offline'>('online');
  const fromRef = useRef<CountriesAbbrs | 'auto'>('auto');
  const [from, setFrom] = useState<CountriesAbbrs | 'auto'>('auto');
  const toRef = useRef<CountriesAbbrs>('en');
  const [to, setTo] = useState<CountriesAbbrs>('en');
  const translationRef = useRef<string | offlineTranslation>('');
  const [loading, setLoading] = useState<boolean>(false);
  const inputRef = createRef<HTMLInputElement>();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOfflineDict, setSelectedOfflineDict] = useState<OfflineDictAbbrs>();
  const [downloadedDicts, setDownloadedDicts] = useState<OfflineDictAbbrs[]>([]);
  const selectedOfflineDictRef = useRef<OfflineDictAbbrs>();
  const downloadedDictsRef = useRef<OfflineDictAbbrs[]>([]);
  const isOverlappingReqEmitted = useRef(false);
  const [offlineDictsList, setOfflineDictsList] = useState<OfflineDictsList>(
    {
      ar: { percentage: NOT_DOWNLOADED, volume: '429 MB', name: "Arabic" },
      en: { percentage: NOT_DOWNLOADED, volume: '1.5 GB', name: "English" },
      fr: { percentage: NOT_DOWNLOADED, volume: '324 MB', name: "French" },
      de: { percentage: NOT_DOWNLOADED, volume: '685 MB', name: "German" },
      it: { percentage: NOT_DOWNLOADED, volume: '424 MB', name: "Italian" },
      fa: { percentage: NOT_DOWNLOADED, volume: '57 MB', name: "Persian" },
      es: { percentage: NOT_DOWNLOADED, volume: '617 MB', name: "Spanish" },
    }
  );
  let clipboardBuffer: string | null;
  let isSpeaking = false;

  const setRefCurrent = (ref: MutableRefObject<string | offlineTranslation>, value: string | offlineTranslation) => {
    ref.current = value
  }

  function translationSpeakHandler(e: KeyboardEvent) {
    if (!translationRef.current) return;
    if (toRef.current === 'fa') return;
    if (e.key !== 'Enter' || !e.ctrlKey) return;
    if (activeTab === 'offline') return;
    speak(translationRef.current as string, toRef.current);
  }

  function inputSpeakHandler(this: HTMLInputElement, e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey) return;
    if (activeTabRef.current === 'online' && fromRef.current === 'fa') return;
    if (activeTabRef.current === 'offline' && selectedOfflineDictRef.current === 'fa') return;

    const { value } = this;
    speak(value, activeTabRef.current === 'online' ? fromRef.current : selectedOfflineDictRef.current || 'auto');
  }

  async function emitNewConfig() {
    const { x, y } = await appWindow.outerPosition();
    const { width, height } = await appWindow.innerSize();

    emit('new_config', {
      activeTab: activeTabRef.current,
      from: fromRef.current,
      to: toRef.current,
      selectedOfflineDict: selectedOfflineDictRef.current,
      downloadedDicts: downloadedDictsRef.current.length ? downloadedDictsRef.current : undefined,
      x,
      y,
      width,
      height
    } as SavedConfig);
  }

  useEffect(() => {
    once<SavedConfig>('get_saved_config', ({ payload: { activeTab, from, to, selectedOfflineDict, downloadedDicts } }) => {
      activeTab && setActiveTab(activeTab as 'online' | 'offline')
      from && setFrom(from)
      to && setTo(to)
      selectedOfflineDict && setSelectedOfflineDict(selectedOfflineDict)
      downloadedDicts?.length && setDownloadedDicts(downloadedDicts)
    });

    emit('front_is_up');

    appWindow.onCloseRequested(e => {
      e.preventDefault();
      once("config_saved", () => appWindow.close());
      emitNewConfig();
    });

    once('quit', () => emitNewConfig())

    inputRef.current?.addEventListener('keypress', inputSpeakHandler);
    window.addEventListener('keypress', translationSpeakHandler);

    const readClipboard = (clip: string | null) => {
      if (!clip?.trim()) return;
      if (clip === clipboardBuffer) return;
      if (clip.search(/[;{}\[\]<>]/) >= 0) return;

      clipboardBuffer = clip;
      setInputVal(clip);
    }

    // run readText once to store/read clipboard content which may exist before opening the app. 
    readText().then(clip => readClipboard(clip))

    const focusListener = listen<FocusEvent>('tauri://focus',
      () => readText().then(clip => readClipboard(clip))
    );

    const downloadingListener = listen<DownloadStatus>('downloading', (msg) => {
      offlineDictsList[msg.payload.name].percentage = msg.payload.percentage;
      setOfflineDictsList({ ...offlineDictsList });
    });

    return () => {
      focusListener.then(f => f());
      downloadingListener.then(d => d());
    }
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
    appWindow.setTitle(`Tiny Beast (${activeTab})`);
  }, [activeTab]);

  useEffect(() => {
    selectedOfflineDictRef.current = selectedOfflineDict;
  }, [selectedOfflineDict]);

  useEffect(() => {
    downloadedDictsRef.current = downloadedDicts;
    emitNewConfig();
  }, [downloadedDicts]);

  useEffect(() => {
    if (loading)
      isOverlappingReqEmitted.current = true;

    const timeOutId = setTimeout(() => handler(), 700);
    return () => clearTimeout(timeOutId);
  }, [inputVal]);

  useEffect(() => {
    fromRef.current = from;
    setTimeout(() => handler(), 0);
  }, [from]);

  useEffect(() => {
    toRef.current = to;
    setTimeout(() => handler(), 0);
  }, [to]);

  const langOptions = (option: 'from' | 'to') => {
    const ops: JSX.IntrinsicElements['option'][] = [];
    (Object.keys(onlineDictionaries) as CountriesNames[])
      .filter(country => option === 'from' ? to !== onlineDictionaries[country] : from !== onlineDictionaries[country])
      .map(country => {
        ops.push(<option key={option + country} value={onlineDictionaries[country]}>{country}</option>)
      })
    return ops
  }

  const renderOfflineTranslations = () => {
    if (typeof translationRef.current === 'string') return;
    return (
      <div className={styles.offlineMode}>
        <h3>Position:</h3>
        <div className={styles.pos}>{translationRef.current.pos}</div>
        <h3>Senses:</h3>
        <div className={styles.senses}>
          {translationRef.current.senses.map(s => {
            return <div key={s.glosses[0]}>
              {!!s.categories?.length && <p key={s.categories[0].name}>Categories: {s.categories.map(c => c.name).join(", ")}</p>}
              <p >Glosses: {[...s.glosses]}</p>
              {s.tags && <p>Tags: {s.tags.join(', ')}</p>}
              {s.form_of && <p >Form of: {s.form_of.word} </p>}
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
        {translationRef.current.etymology_templates && <div>
          <strong key="ety temp">Etymology templates:</strong> {translationRef.current.etymology_templates.map(et => et.expansion).join(", ")}
        </div>}
      </div>
    )
  }

  const offlineLangOptions = () => {
    return downloadedDicts.map(d => {
      return <option key={d} value={d}>{offlineDictsList[d].name}</option>
    })
  }

  const swapLang = () => {
    setFrom(to);
    setTo(from === 'auto' ? to === 'en' ? 'fr' : 'en' : from);
    setInputVal(translationRef.current as string);
    setTimeout(() => handler(), 0);
  }

  const speak = (word: string, lang: CountriesAbbrs | 'auto') => {
    if (isSpeaking) return;
    isSpeaking = true;
    invoke<void>('speak', { word, lang }).then(() => isSpeaking = false);
  }

  const invokeBackend = async () => {
    let translationVal: string | offlineTranslation;
    try {
      if (activeTab === 'online') {
        translationVal = await invoke<string>('online_translate', { from: fromRef.current, to: toRef.current, word: inputVal });
      } else {
        if (selectedOfflineDict) {
          translationVal = await invoke<offlineTranslation>('offline_translate', { word: inputVal, lang: selectedOfflineDict });
        } else {
          translationVal = '';
        }
      }
    } catch (er: any) {
      translationVal = er;
    }

    if (isOverlappingReqEmitted.current)
      isOverlappingReqEmitted.current = false;
    else {
      setRefCurrent(translationRef, translationVal)
      setLoading(false)
    }
  }

  const handler = () => {
    if (!inputVal.trim()) return;
    setLoading(true);
    invokeBackend();
  };

  return (
    <div className={styles.App}>
      {isOpen && <Modal
        setIsOpen={setIsOpen}
        downloadedDicts={downloadedDicts}
        setDownloadedDicts={setDownloadedDicts}
        offlineDictsList={offlineDictsList}
        setOfflineDictsList={setOfflineDictsList}
        selectedOfflineDict={selectedOfflineDict}
        setSelectedOfflineDict={setSelectedOfflineDict}
      />}
      <div className={styles.switches}>
        {activeTab === "online" ?
          <div className={styles.languageOptions}>
            <div className={styles.from}>
              <span>from</span>
              <select key="from" value={from} onChange={event => setFrom(event.target.value as CountriesAbbrs)}>
                <option value="auto">Detect</option>
                <>
                  {langOptions('from')}
                </>
              </select>
            </div>

            <button onClick={swapLang}></button>

            <div className={styles.to}>
              <span>to</span>
              <select key="to" value={to} onChange={event => setTo(event.target.value as CountriesAbbrs)}>
                <>
                  {langOptions('to')}
                </>
              </select>
            </div>
          </div>
          :
          <div className={styles.addOrRemoveLangs}>
            <button title="Add or Remove" onClick={() => setIsOpen(true)}></button>
            <div className={styles.offlineDict}>
              <span>Select an offline dictionary:</span>
              <select value={selectedOfflineDict} onChange={e => setSelectedOfflineDict(e.target.value as OfflineDictAbbrs)}>
                <>
                  {offlineLangOptions()}
                </>
              </select>
            </div>
          </div>
        }

        <button className={styles.modeChanger} title={`Go ${activeTab === 'online' ? 'offline' : 'online'}`} style={{ filter: activeTab === 'online' ? 'grayscale(0)' : 'grayscale(.8)' }}
          onClick={() => { activeTab === "online" ? setActiveTab('offline') : setActiveTab('online'); setRefCurrent(translationRef, '') }}>
        </button>
      </div>

      <div className={styles.input}>
        <input ref={inputRef} autoFocus maxLength={256}
          placeholder={(activeTab === 'online' && from === 'fa') || (activeTab === 'offline' && selectedOfflineDict === 'fa') ? 'جستجو...' : 'search...'}
          value={inputVal} onInput={event => { translationRef.current = ''; setInputVal(event.currentTarget.value) }}
          style={{
            direction: (activeTab === 'online' && from === 'fa' || from === 'ar') || (activeTab === 'offline' && selectedOfflineDict === 'fa' || selectedOfflineDict === 'ar') ? 'rtl' : 'ltr',
            fontFamily: (activeTab === 'online' && from === 'fa' || from === 'ar') || (activeTab === 'offline' && selectedOfflineDict === 'fa' || selectedOfflineDict === 'ar') ? 'Noto Naskh' : 'inherit',
            fontSize: (activeTab === 'online' && from === 'fa' || from === 'ar') || (activeTab === 'offline' && selectedOfflineDict === 'fa' || selectedOfflineDict === 'ar') ? '15px' : ''
          }} />
        <button
          title="Press Enter"
          onClick={() => speak(inputVal, activeTab === 'online' ? from : selectedOfflineDict || 'auto')}
          style={{
            opacity: !inputVal || (activeTab === 'online' && from === 'fa') || (activeTab === 'offline' && selectedOfflineDict === 'fa') ? .5 : 1,
            left: (activeTab === 'online' && from !== 'fa' && from !== 'ar') || (activeTab === 'offline' && selectedOfflineDict !== 'fa' && selectedOfflineDict !== 'ar') ? '2px' : 'unset',
            right: (activeTab === 'online' && from !== 'fa' && from !== 'ar') ||  (activeTab === 'offline' && selectedOfflineDict !== 'fa' && selectedOfflineDict !== 'ar') ? 'unset' : '2px',
            transform: (activeTab === 'online' && from === 'fa' || from === 'ar') || (activeTab === 'offline' && selectedOfflineDict === 'fa' || selectedOfflineDict === 'ar') ? 'scaleX(-1)' : 'unset'
          }}
          disabled={!inputVal || (activeTab === 'online' && from === 'fa') || (activeTab === 'offline' && selectedOfflineDict === 'fa')}>
        </button>
      </div>

      <fieldset className={styles.translation} dir={(to === 'fa' || to === 'ar') && activeTab === 'online' ? 'rtl' : 'ltr'} style={{ opacity: loading ? .5 : 1 }}>
        <legend>
          Translation
          <button
            title="Press CTRL + Enter"
            onClick={() => speak(translationRef.current as string, to)} style={{ display: !translationRef.current || to === 'fa' || activeTab === 'offline' ? 'none' : 'block' }}
          >
          </button>
        </legend>
        {typeof translationRef.current === 'string' ? translationRef.current : renderOfflineTranslations()}
      </fieldset>
    </div>
  )
}

export default App
