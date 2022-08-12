import { readText } from '@tauri-apps/api/clipboard';
import { emit, listen, once } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import { createRef, MutableRefObject, useEffect, useRef, useState } from 'react';
import styles from './App.module.scss';
import { countries } from './countries';
import { Modal } from './Modal';

type CountriesKeys = keyof typeof countries;
type CountriesValues = typeof countries[CountriesKeys];
type SavedConfig = {
  activeTab: 'online' | 'offlie';
  from: CountriesValues | 'auto';
  to: CountriesValues;
  x: string;
  y: string
}

function App() {
  const [inputVal, setInputVal] = useState("");
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');
  const activeTabRef = useRef<'online' | 'offline'>('online');
  const fromRef = useRef<CountriesValues | 'auto'>('auto');
  const [from, setFrom] = useState<CountriesValues | 'auto'>('auto');
  const toRef = useRef<CountriesValues>('fa');
  const [to, setTo] = useState<CountriesValues>('fa');
  const translationRef = useRef('');
  const [loading, setLoading] = useState<boolean>(false);
  const inputRef = createRef<HTMLInputElement>();
  const [isOpen, setIsOpen] = useState(false);
  const isOverlappingReqEmitted = useRef(false);
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

    once<SavedConfig>('saved_config', ({ payload: { activeTab, from, to } }) => {
      activeTab && setActiveTab(activeTab as 'online' | 'offline')
      from && setFrom(from as CountriesValues)
      to && setTo(to as CountriesValues)
    })

    const emitNewConfig = async () => {
      const { x, y } = await appWindow.outerPosition()

      emit('new_config', {
        activeTab: activeTabRef.current,
        from: fromRef.current,
        to: toRef.current,
        x,
        y
      });
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

    listen<FocusEvent>('tauri://focus',
      () => readText().then(clip => readClipboard(clip))
    )
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
    (Object.keys(countries) as CountriesKeys[])
      .filter(country => option === 'from' ? to !== countries[country] : from !== countries[country])
      .map(country => {
        ops.push(<option key={option + country} value={countries[country]}>{country}</option>)
      })
    return ops
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
    invoke<string>('speak', { word, lang }).then(() => isSpeaking = false);
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
      {isOpen && <Modal setIsOpen={setIsOpen} />}
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
              <select>
                <>
                  <option value="fr">French</option>
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
            direction: from === 'fa' ? 'rtl' : 'ltr',
            fontFamily: from === 'fa' ? 'Noto Naskh' : 'inherit',
            fontSize: from === 'fa' ? '15px' : ''
          }} />
        <button
          title="Press Enter"
          onClick={() => speak(inputVal, from)}
          style={{
            opacity: !inputVal || from === 'fa' ? .5 : 1, left: from !== 'fa' ? '2px' : 'unset', right: from !== 'fa' ? 'unset' : '2px',
            transform: from === 'fa' ? 'scaleX(-1)' : 'unset'
          }}
          disabled={!inputVal || from === 'fa'}>
        </button>
      </div>

      <fieldset className={styles.translation} dir={to === 'fa' ? 'rtl' : 'ltr'} style={{ opacity: loading ? .5 : 1 }}>
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
