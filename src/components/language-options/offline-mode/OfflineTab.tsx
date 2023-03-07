import { MutableRefObject, useMemo } from 'react';
import { OfflineDictAbbrs, OfflineDictsList, OfflineTranslation } from '../../../types/offline-mode';
import styles from './OfflineTab.module.scss';

export function OfflineTab({
    offlineDictsList,
    downloadedDicts,
    selectedOfflineDict,
    setSelectedOfflineDict,
    setIsOpen
}: {
    offlineDictsList: OfflineDictsList,
    downloadedDicts: OfflineDictAbbrs[],
    selectedOfflineDict: OfflineDictAbbrs | undefined,
    setSelectedOfflineDict: React.Dispatch<React.SetStateAction<OfflineDictAbbrs | undefined>>,
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
    const renderOfflineLangOptions = () => {
        return downloadedDicts.map(d => {
            return <option key={d} value={d}>{offlineDictsList[d].name}</option>
        })
    }

    const offlineLangOptions = useMemo(() => renderOfflineLangOptions(), [downloadedDicts]);

    return (
        <div className={styles.addOrRemoveLangs}>
            <button title="Add or Remove" onClick={() => setIsOpen(true)}></button>
            <div className={styles.offlineDict}>
                <span>Select an offline dictionary:</span>
                <select value={selectedOfflineDict} onChange={e => { setSelectedOfflineDict(e.target.value as OfflineDictAbbrs); }}>
                    {offlineLangOptions}
                </select>
            </div>
        </div>
    );
}