import { MutableRefObject } from 'react';
import { OfflineDictAbbrs, OfflineDictsList, OfflineTranslation } from '../../../types/offline-mode';
import styles from './OfflineTab.module.scss';

export function OfflineTab({
    translationRef,
    offlineDictsList,
    downloadedDicts,
    selectedOfflineDict,
    setSelectedOfflineDict,
    setInputVal,
    setIsOpen
}: {
    translationRef: MutableRefObject<string | OfflineTranslation>,
    offlineDictsList: OfflineDictsList,
    downloadedDicts: OfflineDictAbbrs[],
    selectedOfflineDict: OfflineDictAbbrs | undefined,
    setSelectedOfflineDict: React.Dispatch<React.SetStateAction<OfflineDictAbbrs | undefined>>,
    setInputVal: React.Dispatch<React.SetStateAction<string>>,
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
    const offlineLangOptions = () => {
        return downloadedDicts.map(d => {
            return <option key={d} value={d}>{offlineDictsList[d].name}</option>
        })
    }

    return (
        <div className={styles.addOrRemoveLangs}>
            <button title="Add or Remove" onClick={() => setIsOpen(true)}></button>
            <div className={styles.offlineDict}>
                <span>Select an offline dictionary:</span>
                <select value={selectedOfflineDict} onChange={e => { translationRef.current = ''; setInputVal(''); setSelectedOfflineDict(e.target.value as OfflineDictAbbrs); }}>
                    <>
                        {offlineLangOptions()}
                    </>
                </select>
            </div>
        </div>
    );
}