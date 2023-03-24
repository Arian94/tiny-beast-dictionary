import { useMemo } from 'react';
import { CountriesAbbrs, CountriesNames, onlineDictionaries } from '../../models/countries';
import styles from './OnlineTab.module.scss';

export function OnlineTab({
    from, setFrom,
    to, setTo,
    swapLang
}: {
    from: CountriesAbbrs | "auto", setFrom: React.Dispatch<React.SetStateAction<CountriesAbbrs | "auto">>,
    to: CountriesAbbrs, setTo: React.Dispatch<React.SetStateAction<CountriesAbbrs>>,
    swapLang: () => void
}) {
    const renderLangOptions = (option: 'from' | 'to') => (Object.keys(onlineDictionaries) as CountriesNames[])
        .map(country => <option key={option + country} value={onlineDictionaries[country]}>{country}</option>);

    const fromOptions = useMemo(() => renderLangOptions('from'), []);
    const toOptions = useMemo(() => renderLangOptions('to'), []);

    return (
        <div className={styles.languageOptions}>
            <div className={styles.from}>
                <span>from</span>
                <select key="from" value={from} onChange={event => setFrom(event.target.value as CountriesAbbrs)}>
                    <option value="auto">Detect</option>
                    {fromOptions}
                </select>
            </div>

            <button className="glow-animation" onClick={swapLang}></button>

            <div className={styles.to}>
                <span>to</span>
                <select key="to" value={to} onChange={event => setTo(event.target.value as CountriesAbbrs)}>
                    {toOptions}
                </select>
            </div>
        </div>
    );
}