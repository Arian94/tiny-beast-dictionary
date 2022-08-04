import { readText } from '@tauri-apps/api/clipboard';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { createRef, MutableRefObject, useEffect, useRef, useState } from 'react';
import './App.scss';
import './assets/fonts/persian/NotoSansArabic.ttf';
import { google_translate_icon } from './assets/images';
import { countries } from './countries';

type CountriesKeys = keyof typeof countries;
type CountriesValues = typeof countries[CountriesKeys];

// todo save configs and settings
function App() {
  const translationSpeakHandler = function (e: KeyboardEvent) {
    if (!translationRef.current) return;
    if (toRef.current === 'fa') return;
    if (e.key !== 'Enter' || !e.ctrlKey) return;
    speak(translationRef.current, toRef.current);
  }

  const inputSpeakHandler = function (this: HTMLInputElement, e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey) return;
    const { value } = this;
    speak(value, fromRef.current);
  }

  const [inputVal, setInputVal] = useState("");
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');
  const fromRef = useRef<CountriesValues | 'auto'>('auto');
  const [from, setFrom] = useState<CountriesValues | 'auto'>('auto');
  const toRef = useRef<CountriesValues>('fa');
  const [to, setTo] = useState<CountriesValues>('fa');
  const translationRef = useRef('');
  const [loading, setLoading] = useState<boolean>(false);
  const inputRef = createRef<HTMLInputElement>();
  let clipboardBuffer: string | null;

  const setRefCurrent = (ref: MutableRefObject<string>, value: string) => {
    ref.current = value
  }

  useEffect(() => {
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
    setTimeout(() => handler(), 0);
  }

  const speak = (word: string, lang: CountriesValues | 'auto') => {
    invoke<string>('speak', { word, lang });
  }

  const invokeBackend = async () => {
    let translationVal = '';
    if (activeTab === 'online')
      translationVal = await invoke<string>('google_translate', { from: fromRef.current, to: toRef.current, word: inputVal });
    else {
      try {
        const dt = await invoke<string>('find', { word: inputVal });
        translationVal = dt;
      } catch (er: any) {
        translationVal = er;
      }
    }
    setRefCurrent(translationRef, translationVal)
    setLoading(false)
  }

  const handler = () => {
    if (!inputVal.trim() || !isNaN(+inputVal)) return;
    setLoading(true);
    invokeBackend();
  };

  return (
    <div className="App">
      <ul className="nav">
        <li className={activeTab === "online" ? "active" : ""} onClick={() => { setActiveTab('online'); setRefCurrent(translationRef, '') }}>
          Online
          <img src={google_translate_icon} />
        </li>
        <li className={activeTab === "offline" ? "active" : ""} onClick={() => { setActiveTab('offline'); setRefCurrent(translationRef, '') }}>
          En-Fa <sup>(Offline)</sup>
        </li>
      </ul>

      {activeTab === "online" ?
        <div className="language-options">
          <div className="from">
            <span>from</span>
            <select key="from" value={from} onChange={event => setFrom(event.target.value as CountriesValues)}>
              <option value="auto">Detect</option>
              <>
                {langOptions('from')}
              </>
            </select>
          </div>

          <button onClick={swapLang}></button>

          <div className="to">
            <span>to</span>
            <select key="to" value={to} onChange={event => setTo(event.target.value as CountriesValues)}>
              <>
                {langOptions('to')}
              </>
            </select>
          </div>
        </div> : undefined
      }

      <div className="input">
        <input ref={inputRef} autoFocus placeholder={from === 'fa' ? 'جستجو...' : 'search...'} value={inputVal} onInput={event => setInputVal(event.currentTarget.value)}
          style={{
            direction: from === 'fa' ? 'rtl' : 'ltr',
            fontFamily: from === 'fa' ? 'PersianFont' : 'inherit',
            fontSize: from === 'fa' ? '10px' : 'inherit'
          }} />
        <button onClick={() => speak(inputVal, from)}
          style={{
            opacity: !inputVal || from === 'fa' ? .5 : 1, left: from !== 'fa' ? '2px' : 'unset', right: from !== 'fa' ? 'unset' : '2px',
            transform: from === 'fa' ? 'scaleX(-1)' : 'unset'
          }}
          disabled={!inputVal || from === 'fa'}>
        </button>
      </div>

      <fieldset className='translation' dir={to === 'fa' ? 'rtl' : 'ltr'} style={{ opacity: loading ? .5 : 1 }}>
        <legend>
          Translation
          <button onClick={() => speak(translationRef.current, to)} style={{ display: !translationRef.current || to === 'fa' ? 'none' : 'block' }}
            disabled={!translationRef || to === 'fa'}>
          </button>
        </legend>
        {translationRef.current}
      </fieldset>
    </div>
  )
}

export default App
