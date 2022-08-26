import { readText } from '@tauri-apps/api/clipboard';
import { emit, listen, once } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import { createRef, MutableRefObject, useEffect, useRef, useState } from 'react';
import styles from './App.module.scss';
import { offlineDictionaries, onlineDictionaries } from './countries';
import { Modal } from './Modal';

type CountriesKeys = keyof typeof onlineDictionaries;
type CountriesValues = typeof onlineDictionaries[CountriesKeys];
export type OfflineDict = keyof typeof offlineDictionaries;
export type OfflineDictsList = { [key in OfflineDict]: { percentage: number; volume: string } };
type SavedConfig = {
  activeTab: 'online' | 'offline';
  from: CountriesValues | 'auto';
  to: CountriesValues;
  selectedOfflineDict?: OfflineDict;
  downloadedDicts?: OfflineDict[];
  x: number;
  y: number;
}
export type DownloadStatus = { name: OfflineDict; percentage: number };

function App() {
  const [inputVal, setInputVal] = useState("");
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');
  const activeTabRef = useRef<'online' | 'offline'>('online');
  const fromRef = useRef<CountriesValues | 'auto'>('auto');
  const [from, setFrom] = useState<CountriesValues | 'auto'>('auto');
  const toRef = useRef<CountriesValues>('en');
  const [to, setTo] = useState<CountriesValues>('en');
  const translationRef = useRef('');
  const [loading, setLoading] = useState<boolean>(false);
  const inputRef = createRef<HTMLInputElement>();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOfflineDict, setSelectedOfflineDict] = useState<OfflineDict>();
  const [downloadedDicts, setDownloadedDicts] = useState<OfflineDict[]>([]);
  const isOverlappingReqEmitted = useRef(false);
  const [offlineDictsList, setOfflineDictsList] = useState<OfflineDictsList>(
    {
      Arabic: { percentage: -1, volume: 'xxx' },
      English: { percentage: -1, volume: 'xxx' },
      French: { percentage: -1, volume: 'xxx' },
      German: { percentage: -1, volume: 'xxx' },
      Italian: { percentage: -1, volume: 'xxx' },
      Persian: { percentage: -1, volume: 'xxx' },
      Spanish: { percentage: -1, volume: 'xxx' },
    }
  );
  let clipboardBuffer: string | null;
  let isSpeaking = false;

  const setRefCurrent = (ref: MutableRefObject<string>, value: string) => {
    ref.current = value
  }

  function translationSpeakHandler(e: KeyboardEvent) {
    if (!translationRef.current) return;
    if (toRef.current === 'fa') return;
    if (e.key !== 'Enter' || !e.ctrlKey) return;
    speak(translationRef.current, toRef.current);
  }

  function inputSpeakHandler(this: HTMLInputElement, e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey) return;
    const { value } = this;
    speak(value, fromRef.current);
  }

  useEffect(() => {
    emit('front_is_up');

    once<SavedConfig>('saved_config', ({ payload: { activeTab, from, to, selectedOfflineDict, downloadedDicts } }) => {
      activeTab && setActiveTab(activeTab as 'online' | 'offline')
      from && setFrom(from as CountriesValues)
      to && setTo(to as CountriesValues)
      selectedOfflineDict && setSelectedOfflineDict(selectedOfflineDict)
      downloadedDicts?.length && setDownloadedDicts(downloadedDicts)
    })

    const emitNewConfig = async () => {
      const { x, y } = await appWindow.outerPosition()

      emit('new_config', {
        activeTab: activeTabRef.current,
        from: fromRef.current,
        to: toRef.current,
        selectedOfflineDict,
        downloadedDicts,
        x,
        y
      } as SavedConfig);
    }

    appWindow.onCloseRequested(e => {
      e.preventDefault();
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
    })

    const downloadListener = listen<DownloadStatus>('download_finished', ({ payload: { name } }) => {
      downloadedDicts.push(name);
      setDownloadedDicts(downloadedDicts.slice());
      offlineDictsList[name].percentage = 100;
      setOfflineDictsList({ ...offlineDictsList });
      // console.log('download for', name, 'finished');
    });

    return () => {
      focusListener.then(f => f());
      downloadListener.then(d => d());
      downloadingListener.then(d => d());
    }
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab])

  useEffect(() => {
    if (loading)
      isOverlappingReqEmitted.current = true;

    const timeOutId = setTimeout(() => handler(), 700);
    return () => clearTimeout(timeOutId);
  }, [inputVal]);

  useEffect(() => {
    fromRef.current = from;
    setTimeout(() => handler(), 0);
  }, [from])

  useEffect(() => {
    toRef.current = to;
    setTimeout(() => handler(), 0);
  }, [to])

  const langOptions = (option: 'from' | 'to') => {
    const ops: JSX.IntrinsicElements['option'][] = [];
    (Object.keys(onlineDictionaries) as CountriesKeys[])
      .filter(country => option === 'from' ? to !== onlineDictionaries[country] : from !== onlineDictionaries[country])
      .map(country => {
        ops.push(<option key={option + country} value={onlineDictionaries[country]}>{country}</option>)
      })
    return ops
  }

  const offlineLangOptions = () => {
    return downloadedDicts.map(d => {
      return <option key={d} value={d.slice(0, 2)}>{d}</option>
    })
  }

  const swapLang = () => {
    setFrom(to)
    setTo(from === 'auto' ? to === 'en' ? 'fr' : 'en' : from)
    setInputVal(translationRef.current)
    setTimeout(() => handler(), 0);
  }

  const speak = (word: string, lang: CountriesValues | 'auto') => {
    if (isSpeaking) return;
    isSpeaking = true;
    invoke<void>('speak', { word, lang }).then(() => isSpeaking = false);
  }

  const invokeBackend = async () => {
    let translationVal = '';
    try {
      if (activeTab === 'online')
        translationVal = await invoke<string>('google_translate', { from: fromRef.current, to: toRef.current, word: inputVal });
      else
        translationVal = await invoke<string>('find', { word: inputVal });
    } catch (er: any) {
      translationVal = er === 'not found' ? er : 'connection error';
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
      />}
      <div className={styles.switches}>
        {activeTab === "online" ?
          <div className={styles.languageOptions}>
            <div className={styles.from}>
              <span>from</span>
              <select key="from" value={from} onChange={event => setFrom(event.target.value as CountriesValues)}>
                <option value="auto">Detect</option>
                <>
                  {langOptions('from')}
                </>
              </select>
            </div>

            <button onClick={swapLang}></button>

            <div className={styles.to}>
              <span>to</span>
              <select key="to" value={to} onChange={event => setTo(event.target.value as CountriesValues)}>
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
              <select value={downloadedDicts?.[0]}>
                <>
                  {offlineLangOptions()}
                  {/* <option value="fr">French</option> */}
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
        <input ref={inputRef} autoFocus maxLength={256} placeholder={from === 'fa' ? 'جستجو...' : 'search...'} value={inputVal} onInput={event => setInputVal(event.currentTarget.value)}
          style={{
            direction: from === 'fa' || from === 'ar' ? 'rtl' : 'ltr',
            fontFamily: from === 'fa' || from === 'ar' ? 'Noto Naskh' : 'inherit',
            fontSize: from === 'fa' || from === 'ar' ? '15px' : ''
          }} />
        <button
          title="Press Enter"
          onClick={() => speak(inputVal, from)}
          style={{
            opacity: !inputVal || from === 'fa' ? .5 : 1, left: from !== 'fa' && from !== 'ar' ? '2px' : 'unset', right: from !== 'fa' && from !== 'ar' ? 'unset' : '2px',
            transform: from === 'fa' || from === 'ar' ? 'scaleX(-1)' : 'unset'
          }}
          disabled={!inputVal || from === 'fa'}>
        </button>
      </div>

      <fieldset className={styles.translation} dir={to === 'fa' || to === 'ar' ? 'rtl' : 'ltr'} style={{ opacity: loading ? .5 : 1 }}>
        <legend>
          Translation
          <button
            title="Press CTRL + Enter"
            onClick={() => speak(translationRef.current, to)} style={{ display: !translationRef.current || to === 'fa' ? 'none' : 'block' }}
            disabled={!translationRef || to === 'fa'}>
          </button>
        </legend>
        {translationRef.current}
      </fieldset>
    </div>
  )
}

export default App
