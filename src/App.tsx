import { process } from '@tauri-apps/api';
import { emit, listen, once } from '@tauri-apps/api/event';
import { appWindow } from '@tauri-apps/api/window';
import { createRef, MutableRefObject, useEffect, useRef, useState } from 'react';
import { version } from '../package.json';
import styles from './App.module.scss';
import { Modal, NOT_DOWNLOADED } from './components/language-options/offline-mode/Modal';
import { OfflineTab } from './components/language-options/offline-mode/OfflineTab';
import { OnlineTab } from './components/language-options/OnlineTab';
import { Translation, TranslationCompOutput } from './components/Translation';
import { CountriesAbbrs, SavedConfig } from './models/countries';
import { OfflineDictAbbrs, OfflineDictsList } from './models/offline-mode';
import { Theme } from './models/theme';

type DownloadStatus = { name: OfflineDictAbbrs; percentage: number };

function App() {
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');
  const activeTabRef = useRef<'online' | 'offline'>(activeTab);
  const [from, setFrom] = useState<CountriesAbbrs | 'auto'>('auto');
  const fromRef = useRef<CountriesAbbrs | 'auto'>(from);
  const [to, setTo] = useState<CountriesAbbrs>('en');
  const toRef = useRef<CountriesAbbrs>(to);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOfflineDict, setSelectedOfflineDict] = useState<OfflineDictAbbrs>();
  const [downloadedDicts, setDownloadedDicts] = useState<OfflineDictAbbrs[]>([]);
  const selectedOfflineDictRef = useRef<OfflineDictAbbrs>();
  const downloadedDictsRef = useRef<OfflineDictAbbrs[]>([]);
  const isLangSwapped = useRef(false);
  const [offlineDictsList, setOfflineDictsList] = useState<OfflineDictsList>(
    {
      en: { percentage: NOT_DOWNLOADED, zipped: '94 MB', extracted: '621 MB', name: "English", isBootUp: false },
      fr: { percentage: NOT_DOWNLOADED, zipped: '25 MB', extracted: '324 MB', name: "French", isBootUp: false },
      de: { percentage: NOT_DOWNLOADED, zipped: '41 MB', extracted: '686 MB', name: "German", isBootUp: false },
      es: { percentage: NOT_DOWNLOADED, zipped: '39 MB', extracted: '617 MB', name: "Spanish", isBootUp: false },
      it: { percentage: NOT_DOWNLOADED, zipped: '32 MB', extracted: '424 MB', name: "Italian", isBootUp: false },
      fa: { percentage: NOT_DOWNLOADED, zipped: '3 MB', extracted: '54 MB', name: "Persian", isBootUp: false },
      pt: { percentage: NOT_DOWNLOADED, zipped: '20 MB', extracted: '279 MB', name: "Portuguese", isBootUp: false },
      "zh-CN": { percentage: NOT_DOWNLOADED, zipped: '47 MB', extracted: '619 MB', name: "Chinese (Simplified)", isBootUp: false },
      ar: { percentage: NOT_DOWNLOADED, zipped: '20 MB', extracted: '429 MB', name: "Arabic", isBootUp: false },
    }
  );
  const shouldTranslateClipboardRef = useRef(false);
  const _shouldTranslateSelectedTextRef = useRef(false);
  const tranlationCompRef = createRef<TranslationCompOutput>();

  let selectedTheme: Theme = "default";

  function setRefCurrent<T>(ref: MutableRefObject<T> | undefined, value: T) {
    if (ref) ref.current = value
  }

  async function emitNewConfig(selectedOfflineDict?: OfflineDictAbbrs | null, downloadedDicts?: OfflineDictAbbrs[]) {
    const { x, y } = await appWindow.outerPosition();
    const { width, height } = await appWindow.innerSize();
    const sod = selectedOfflineDict || (selectedOfflineDict === null ? undefined : (selectedOfflineDictRef.current || undefined));
    const dd = downloadedDicts || downloadedDictsRef.current;

    const config: SavedConfig = {
      theme: selectedTheme,
      activeTab: activeTabRef.current,
      from: fromRef.current,
      to: toRef.current,
      selectedOfflineDict: sod,
      downloadedDicts: dd.length ? dd : undefined,
      x,
      y,
      width,
      height,
      shouldTranslateClipboard: shouldTranslateClipboardRef.current,
      shouldTranslateSelectedText: _shouldTranslateSelectedTextRef.current
    };
    emit('new_config', config);
  }

  useEffect(() => {
    const changeTheme = (theme: Theme = "default") => {
      selectedTheme = theme;
      document.documentElement.setAttribute("theme", theme);
    }

    once<SavedConfig>('get_saved_config',
      ({ payload: { theme, activeTab, from, to, selectedOfflineDict, downloadedDicts, shouldTranslateClipboard: tc, shouldTranslateSelectedText: ts } }) => {
        activeTab && setActiveTab(activeTab as 'online' | 'offline');
        from && setFrom(from);
        to && setTo(to);
        setSelectedOfflineDict(selectedOfflineDict);
        setDownloadedDicts(downloadedDicts ?? []);
        setRefCurrent(shouldTranslateClipboardRef, !!tc);
        setRefCurrent(_shouldTranslateSelectedTextRef, !!ts);
        changeTheme(theme);
      }).then(() => emit('front_is_up'));

    const quit = once('quit', () => emitNewConfig());
    const themeListener = listen<Theme>('theme_changed', ({ payload }) => changeTheme(payload));
    const downloadingListener = listen<DownloadStatus>('downloading', ({ payload }) => {
      offlineDictsList[payload.name].percentage = payload.percentage;
      setOfflineDictsList({ ...offlineDictsList });
    });

    const closeApp = appWindow.onCloseRequested(async e => {
      e.preventDefault();
      await once("config_saved", () => process.exit());
      emitNewConfig();
    });

    if (import.meta.env.DEV) return;

    const cm = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('contextmenu', cm);

    return () => {
      quit.then(d => d());
      themeListener.then(d => d());
      downloadingListener.then(d => d());
      closeApp.then(d => d());
      window.removeEventListener('contextmenu', cm)
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
    fromRef.current = from;
    toRef.current = to;
    isLangSwapped.current ? tranlationCompRef.current?.langSwapped() : tranlationCompRef.current?.translate();
    isLangSwapped.current = false;
  }, [from, to]);

  const swapLang = () => {
    isLangSwapped.current = true;
    setFrom(to);
    setTo(from === 'auto' ? to === 'en' ? 'fr' : 'en' : from);
  }

  return (
    <div className={styles.App} onDragOver={(e) => e.preventDefault()}>
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
            setIsOpen={setIsOpen}
          />
        }

        <button className={styles.modeChanger} title={`Go ${activeTab === 'online' ? 'offline' : 'online'}`}
          style={{ filter: activeTab === 'online' ? 'grayscale(0)' : 'grayscale(.8)' }}
          onClick={() => { setRefCurrent(tranlationCompRef.current?.translationTextareaRef, ''); setActiveTab(activeTab === "online" ? 'offline' : 'online'); }}>
        </button>
      </div>

      <Translation
        ref={tranlationCompRef}
        key="translation"
        activeTabRef={activeTabRef}
        fromRef={fromRef}
        toRef={toRef}
        selectedOfflineDictRef={selectedOfflineDictRef}
        emitNewConfig={emitNewConfig}
        offlineDictsList={offlineDictsList}
        shouldTranslateClipboardRef={shouldTranslateClipboardRef}
        _shouldTranslateSelectedTextRef={_shouldTranslateSelectedTextRef}
      />

      <span className={styles.version}>v.{version}</span>
    </div>
  )
}

export default App
