
import { invoke } from "@tauri-apps/api";
import { appWindow } from '@tauri-apps/api/window';
import { useEffect } from "react";
import { OfflineDictAbbrs, OfflineDictsList } from "./App";
import styles from "./Modal.module.scss";

export const Modal: React.FC<{
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  downloadedDicts: OfflineDictAbbrs[];
  setDownloadedDicts: React.Dispatch<React.SetStateAction<(OfflineDictAbbrs)[]>>;
  offlineDictsList: OfflineDictsList;
  setOfflineDictsList: React.Dispatch<React.SetStateAction<OfflineDictsList>>;
  setSelectedOfflineDict: React.Dispatch<React.SetStateAction<OfflineDictAbbrs | undefined>>;
}>
  = ({ setIsOpen, downloadedDicts, setDownloadedDicts, offlineDictsList, setOfflineDictsList, setSelectedOfflineDict }) => {
    useEffect(() => {
      downloadedDicts.forEach(dd => offlineDictsList[dd].percentage = 100);
      setOfflineDictsList({ ...offlineDictsList });
    }, []);

    const downloadCancelDelete = (abbr: OfflineDictAbbrs) => {
      offlineDictsList[abbr].percentage = 0;
      setOfflineDictsList({ ...offlineDictsList });
      console.log('download for', abbr, 'started');
      invoke<string>('download_dict', { abbr, appWindow }).then((possibleErr) => {
        console.log(possibleErr)
        if (possibleErr) return;
        downloadedDicts.push(abbr);
        setDownloadedDicts(downloadedDicts.slice());
        offlineDictsList[abbr].percentage = 100;
        setOfflineDictsList({ ...offlineDictsList });
        setSelectedOfflineDict(abbr);
      });
    }

    const langOptions = () => {
      return (Object.keys(offlineDictsList) as OfflineDictAbbrs[])
        .map(abbr => {
          const dict = offlineDictsList[abbr];
          const dlStatusIcon = dict.percentage === -1 ? '/src/assets/download.svg' : dict.percentage === 100 ? '/src/assets/delete.svg' : '/src/assets/cancel.svg';
          return (
            <div key={abbr} className={styles.dict}>
              <span>{dict.name} ({dict.volume} MB)</span>
              <div className={styles.download}>
                {dict.percentage !== -1 && dict.percentage !== 100 ? <span>{dict.percentage}%</span> : ''}
                <button
                  style={{
                    backgroundImage: `url(${dlStatusIcon})`,
                    backgroundSize: true ? '20px' : '25px'
                  }}
                  onClick={() => downloadCancelDelete(abbr)}
                ></button>
              </div>
            </div>
          )
        })
    }

    return (
      <>
        <div className={styles.darkBG} onClick={() => setIsOpen(false)} />

        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h4 className={styles.heading}>Offline Resources</h4>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
              X
            </button>
          </div>

          <div className={styles.modalContent}>
            <p>List of available dictionaries:</p>
            <div className={styles.scroller}>
              <>
                {langOptions()}
              </>
            </div>
          </div>

          <div className={styles.modalActions}>
            <div className={styles.actionsContainer}>
              {/* <button className={styles.deleteBtn} onClick={() => setIsOpen(false)}>
                                Delete
                            </button> */}
              <button
                className={styles.cancelBtn}
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };