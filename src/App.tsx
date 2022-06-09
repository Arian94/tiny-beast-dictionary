import { readText } from '@tauri-apps/api/clipboard';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useRef, useState } from 'react';
import './App.scss';
import './assets/fonts/persian/NotoSansArabic.ttf';
import { google_translate_icon } from './assets/images';
import { countries } from './countries';

type CountriesKeys = keyof typeof countries;
type CountriesValues = typeof countries[CountriesKeys];

function App() {
  const [translation, setTranslation] = useState("");
  const [value, setValue] = useState("");
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');
  const [from, setFrom] = useState<CountriesValues | 'auto'>('auto');
  const [to, setTo] = useState<CountriesValues>('fa');
  const inputElm = useRef<HTMLInputElement>();
  let clipboardBuffer: string | null;

  useEffect(() => {
    inputElm.current = document.getElementsByTagName('input')[0];

    const readClipboard = (clip: string | null) => {
      if (!clip?.trim()) return;
      if (clip === clipboardBuffer) return;
      if (clip.search(/[;{}\[\]<>]/) >= 0) return;

      clipboardBuffer = clip;
      if (!inputElm.current) return;
      inputElm.current.value = clip;
      setValue(clip);
    }

    // run readText once to store/read clipboard content which may exist before opening the app. 
    readText().then(clip => readClipboard(clip))

    listen<FocusEvent>('tauri://focus',
      () => readText().then(clip => readClipboard(clip))
    )
  }, []);

  useEffect(() => {
    const timeOutId = setTimeout(() => handler(), 500);
    return () => clearTimeout(timeOutId);
  }, [value, from, to]);

  const langOptions = (option: 'from' | 'to') => {
    const ops: JSX.IntrinsicElements['option'][] = [];
    (Object.keys(countries) as CountriesKeys[])
      .map(country => {
        ops.push(<option key={option + country} value={countries[country]}>{country}</option>)
      })

    return ops
  }

  const invokeBackend = () => {
    let translation = '';
    if (activeTab === 'online')
      invoke<string>('google_translate', { from, to, word: value }).then(dt => {
        setTranslation(dt);
      })
    else
      invoke<string[]>('find', { word: value }).then(dt => {
        translation = ('' + dt).replaceAll(",", " - ");
      }).catch(er => {
        translation = er;
      }).finally(() => setTranslation(translation))
  }

  const handler = () => {
    if (!inputElm.current) return;
    const { value } = inputElm.current;
    if (!value.trim()) return;
    if (!isNaN(+value)) return;
    invokeBackend();
  };

  return (
    <div className="App">
      <ul className="nav">
        <li
          className={activeTab === "online" ? "active" : ""}
          onClick={() => setActiveTab('online')}>
          Online
          <img src={google_translate_icon} />
        </li>
        <li
          className={activeTab === "offline" ? "active" : ""}
          onClick={() => setActiveTab('offline')}>
          En-Fa (Offline)
        </li>
      </ul>

      {activeTab === "online" ?
        <div className="language-options">
          <span>from</span>
          <select key="from"
            onChange={event => setFrom(event.target.value as CountriesValues)} value={from}>
            <option value="auto">Detect</option>
            <>
              {langOptions('from')}
            </>
          </select>

          <span>to</span>
          <select key="to"
            onChange={event => setTo(event.target.value as CountriesValues)} value={to}>
            <>
              {langOptions('to')}
            </>
          </select>
        </div> : undefined
      }

      <input type="search" autoFocus placeholder='type...'
        onChange={event => setValue(event.target.value)} />
      <p className='translation' dir={to === 'fa' ? 'rtl' : 'ltr'} >{translation}</p>
    </div>
  )
}

export default App
