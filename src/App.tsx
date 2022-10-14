import { process } from '@tauri-apps/api';
import { readText } from '@tauri-apps/api/clipboard';
import { emit, listen, once } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { MutableRefObject, useEffect, useRef, useState } from 'react';
import styles from './App.module.scss';
import { Modal, NOT_DOWNLOADED } from './components/language-options/offline-mode/Modal';
import { OfflineTab } from './components/language-options/offline-mode/OfflineTab';
import { OnlineTab } from './components/language-options/OnlineTab';
import { Translation } from './components/Translation';
import { CountriesAbbrs, SavedConfig } from './types/countries';
import { INIT_DICT, OfflineDictAbbrs, OfflineDictsList, OfflineTranslation } from './types/offline-mode';

type DownloadStatus = { name: OfflineDictAbbrs; percentage: number };

function App() {
  const [inputVal, setInputVal] = useState("");
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');
  const activeTabRef = useRef<'online' | 'offline'>('online');
  const fromRef = useRef<CountriesAbbrs | 'auto'>('auto');
  const [from, setFrom] = useState<CountriesAbbrs | 'auto'>('auto');
  const toRef = useRef<CountriesAbbrs>('en');
  const [to, setTo] = useState<CountriesAbbrs>('en');
  const translationRef = useRef<string | OfflineTranslation>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOfflineDict, setSelectedOfflineDict] = useState<OfflineDictAbbrs>();
  const [downloadedDicts, setDownloadedDicts] = useState<OfflineDictAbbrs[]>([]);
  const selectedOfflineDictRef = useRef<OfflineDictAbbrs>();
  const downloadedDictsRef = useRef<OfflineDictAbbrs[]>([]);
  const isOverlappingReqEmitted = useRef(false);
  const [offlineDictsList, setOfflineDictsList] = useState<OfflineDictsList>(
    {
      en: { percentage: NOT_DOWNLOADED, zipped: '94 MB', extracted: '621 MB', name: "English", isBootUp: false },
      fr: { percentage: NOT_DOWNLOADED, zipped: '25 MB', extracted: '324 MB', name: "French", isBootUp: false },
      de: { percentage: NOT_DOWNLOADED, zipped: '41 MB', extracted: '686 MB', name: "German", isBootUp: false },
      es: { percentage: NOT_DOWNLOADED, zipped: '39 MB', extracted: '617 MB', name: "Spanish", isBootUp: false },
      it: { percentage: NOT_DOWNLOADED, zipped: '32 MB', extracted: '424 MB', name: "Italian", isBootUp: false },
      fa: { percentage: NOT_DOWNLOADED, zipped: '3 MB', extracted: '54 MB', name: "Persian", isBootUp: false },
      pt: { percentage: NOT_DOWNLOADED, zipped: '20 MB', extracted: '279 MB', name: "Portuguese", isBootUp: false },
      "zh-CN": { percentage: NOT_DOWNLOADED, zipped: '47 MB', extracted: '619 MB', name: "Chinese", isBootUp: false },
      ar: { percentage: NOT_DOWNLOADED, zipped: '20 MB', extracted: '429 MB', name: "Arabic", isBootUp: false },
    }
  );
  const translateClipboard = useRef(false);
  const _translateSelectedText = useRef(true);
  const isSpeaking = useRef(false);
  let clipboardBuffer: string | null;

  const setRefCurrent = (ref: MutableRefObject<string | OfflineTranslation>, value: string | OfflineTranslation) => {
    ref.current = value
  }

  function translationSpeakHandler(e: KeyboardEvent) {
    if (!translationRef.current) return;
    if (toRef.current === 'fa') return;
    if (e.code !== 'Enter' || !e.ctrlKey) return;
    if (activeTabRef.current === 'offline') return;
    speak(translationRef.current as string, toRef.current);
  }

  async function emitNewConfig(selectedOfflineDict?: OfflineDictAbbrs | null, downloadedDicts?: OfflineDictAbbrs[]) {
    const { x, y } = await appWindow.outerPosition();
    const { width, height } = await appWindow.innerSize();
    const sod = selectedOfflineDict || (selectedOfflineDict === null ? undefined : (selectedOfflineDictRef.current || undefined));
    const dd = downloadedDicts || downloadedDictsRef.current;

    const config: SavedConfig = {
      activeTab: activeTabRef.current,
      from: fromRef.current,
      to: toRef.current,
      selectedOfflineDict: sod,
      downloadedDicts: dd.length ? dd : undefined,
      x,
      y,
      width,
      height,
      translateClipboard: translateClipboard.current,
      translateSelectedText: _translateSelectedText.current
    };
    emit('new_config', config);
  }

  useEffect(() => {
    once<SavedConfig>('get_saved_config', ({ payload: { activeTab, from, to, selectedOfflineDict, downloadedDicts, translateClipboard: tc, translateSelectedText: ts } }) => {
      activeTab && setActiveTab(activeTab as 'online' | 'offline')
      from && setFrom(from)
      to && setTo(to)
      selectedOfflineDict && setSelectedOfflineDict(selectedOfflineDict)
      downloadedDicts?.length && setDownloadedDicts(downloadedDicts)
      translateClipboard.current = !!tc;
      _translateSelectedText.current = !!ts ?? true;
    });

    emit('front_is_up');

    appWindow.onCloseRequested(e => {
      e.preventDefault();
      once("config_saved", () => setTimeout(() => process.exit(), 250));
      emitNewConfig();
    });

    once('quit', () => emitNewConfig())

    window.addEventListener('keypress', translationSpeakHandler);

    const readClipboard = (clip: string | null) => {
      const trimmed = clip?.trim();
      if (!trimmed) return;
      if (trimmed === clipboardBuffer) return;
      if (trimmed.search(/[{}\[\]<>]/) >= 0) return;

      clipboardBuffer = trimmed;
      setInputVal(trimmed);
    }

    // // run readText once to store/read clipboard content which may exist before opening the app. 
    // readText().then(clip => readClipboard(clip))

    const translateClipboardListener = listen<boolean[]>('tray_settings',
      ({ payload }) => {
        translateClipboard.current = payload[0];
        _translateSelectedText.current = payload[1];
        emitNewConfig();
      });

    const appFocus = appWindow.onFocusChanged(({ payload: isFocused }) => {
      appWindow.emit('app_focus', isFocused);
      if (!isFocused) return;
      if (!translateClipboard.current) return;
      readText().then(clip => readClipboard(clip));
    });

    const downloadingListener = listen<DownloadStatus>('downloading', (msg) => {
      offlineDictsList[msg.payload.name].percentage = msg.payload.percentage;
      setOfflineDictsList({ ...offlineDictsList });
    });

    const translateSelectedTextListener = listen<string>('text_selected', async ({ payload: text }) => {
      setInputVal(text);
      await appWindow.hide();                                                 //* hiding and then showing to suppress the os notification when using appWindow.unminimize()
      const pos = await appWindow.outerPosition();
      await appWindow.setPosition(new PhysicalPosition(pos.x, pos.y - 36));         // neccessary as appWindow.show() forgets the position.
      appWindow.show();
    });

    return () => {
      appFocus.then(f => f());
      downloadingListener.then(d => d());
      translateSelectedTextListener.then(d => d());
      translateClipboardListener.then(d => d());
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

  const swapLang = () => {
    setFrom(to);
    setTo(from === 'auto' ? to === 'en' ? 'fr' : 'en' : from);
    setInputVal(translationRef.current as string);
    setTimeout(() => handler(), 0);
  }

  const speak = (word: string, lang: CountriesAbbrs | 'auto') => {
    if (isSpeaking.current) return;
    isSpeaking.current = true;
    invoke<void>('speak', { word, lang }).then(() => isSpeaking.current = false);
  }

  const invokeBackend = async () => {
    let translationVal: string | OfflineTranslation;
    try {
      if (activeTab === 'online') {
        translationVal = await invoke<string>('online_translate', { from: fromRef.current, to: toRef.current, word: inputVal });
      } else {
        if (selectedOfflineDict) {
          if (!offlineDictsList[selectedOfflineDict].isBootUp) {
            translationVal = INIT_DICT;
            offlineDictsList[selectedOfflineDict].isBootUp = true;
            setRefCurrent(translationRef, translationVal);
          }
          translationVal = await invoke<OfflineTranslation>('offline_translate', { word: inputVal, lang: selectedOfflineDict });
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        emitNewConfig={emitNewConfig}
      />}
      <div className={styles.switches}>
        {activeTab === "online" ?
          <OnlineTab
            key="online-tab"
            from={from}
            setFrom={setFrom}
            to={to}
            setTo={setTo}
            swapLang={swapLang}
          />
          :
          <OfflineTab
            key="offline-tab"
            downloadedDicts={downloadedDicts}
            offlineDictsList={offlineDictsList}
            selectedOfflineDict={selectedOfflineDict}
            setSelectedOfflineDict={setSelectedOfflineDict}
            setInputVal={setInputVal}
            setIsOpen={setIsOpen}
            translationRef={translationRef}
          />
        }

        <button disabled={translationRef.current === INIT_DICT} className={styles.modeChanger} title={`Go ${activeTab === 'online' ? 'offline' : 'online'}`}
          style={{ filter: activeTab === 'online' ? 'grayscale(0)' : 'grayscale(.8)' }}
          onClick={() => { activeTab === "online" ? setActiveTab('offline') : setActiveTab('online'); setRefCurrent(translationRef, ''); setInputVal('') }}>
        </button>
      </div>

      <Translation
        key="translation"
        activeTabRef={activeTabRef}
        fromRef={fromRef}
        toRef={toRef}
        translationRef={translationRef}
        selectedOfflineDictRef={selectedOfflineDictRef}
        inputVal={inputVal}
        setInputVal={setInputVal}
        loading={loading}
        speak={speak}
      />
    </div>
  )
}

export default App
