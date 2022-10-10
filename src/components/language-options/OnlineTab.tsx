import { CountriesAbbrs, CountriesNames, onlineDictionaries } from '../../types/countries';
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
    const langOptions = (option: 'from' | 'to') => {
        const ops: JSX.IntrinsicElements['option'][] = [];
        (Object.keys(onlineDictionaries) as CountriesNames[])
            .filter(country => option === 'from' ? to !== onlineDictionaries[country] : from !== onlineDictionaries[country])
            .map(country => {
                ops.push(<option key={option + country} value={onlineDictionaries[country]}>{country}</option>)
            })
        return ops
    }

    return (
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
    );
}