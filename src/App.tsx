import { readText } from '@tauri-apps/api/clipboard';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useState } from 'react';
import './App.scss';
import './assets/fonts/persian/NotoSansArabic.ttf';

function App() {
  const [translation, setTranslation] = useState("");
  const [value, setValue] = useState("");
  let clipboardBuffer: string;
  // With the Tauri API npm package:
  // With the Tauri global script, enabled when `tauri.conf.json > build > withGlobalTauri` is set to true:
  // const clipboard = window.__TAURI__.clipboard;
  
  const invokeBackend = () =>{
    let translation = '';

    invoke<string[]>('find', { word: value }).then((dt: string[]): void => {
      console.log(dt);
      translation = ('' + dt).replaceAll(",", " - ");
    }).catch(er => {
      translation = er;
    }).finally(() => setTranslation(translation))
  }

listen<FocusEvent>('tauri://focus', () => {
  readText().then(clip => {
      console.log('listene?', clip);
      
      if (!clip) return;
      if (clip === clipboardBuffer) return;

    clipboardBuffer = clip;
    const inputElm = document.getElementsByTagName('input')[0];
    inputElm.value = clip;
    setValue(clip);
    });
  })

  useEffect(() => {
    const timeOutId = setTimeout(() => handler(), 500);
    return () => clearTimeout(timeOutId);
  }, [value]);

  const handler = () => {
    const value = document.getElementsByTagName('input')[0].value
    if (!value.trim()) return;
    if (!isNaN(+value)) return;
    console.log('useeffecte?');

    invokeBackend();
  };

  return (
    <div className="App">
      <input type="search" autoFocus placeholder='type...'
        onChange={event => setValue(event.target.value)} />
      <p className='translation'>{translation}</p>
    </div>
  )
}

export default App
