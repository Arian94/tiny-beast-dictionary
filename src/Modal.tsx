
import { invoke } from "@tauri-apps/api";
import { emit } from "@tauri-apps/api/event";
import { appWindow } from '@tauri-apps/api/window';
import { useEffect } from "react";
import { OfflineDictAbbrs, OfflineDictsList } from "./App";
import styles from "./Modal.module.scss";

export const NOT_DOWNLOADED = -1;
const WAIT_FOR_PROCESSING = 99;
const DOWNLOADED = 100;

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
      downloadedDicts.forEach(dd => offlineDictsList[dd].percentage = DOWNLOADED);
      setOfflineDictsList({ ...offlineDictsList });
    }, []);

    const downloadCancelDelete = (abbr: OfflineDictAbbrs) => {
      if (offlineDictsList[abbr].percentage === DOWNLOADED) {  //* to delete
        invoke<void>('delete_dict', { abbr })
          .then(() => {
            offlineDictsList[abbr].percentage = NOT_DOWNLOADED;
            const idx = downloadedDicts.findIndex(d => d === abbr);
            downloadedDicts.splice(idx, 1);
            setDownloadedDicts(downloadedDicts.slice());
            !downloadedDicts.length && setSelectedOfflineDict(undefined);
            downloadedDicts.length === 1 && setSelectedOfflineDict(downloadedDicts[0]);
            setOfflineDictsList({ ...offlineDictsList });
          })
          .catch(e => console.error(e))
      } else if (offlineDictsList[abbr].percentage === NOT_DOWNLOADED) {  //* to download
        // console.log('download for', abbr, 'started');
        offlineDictsList[abbr].percentage = 0;
        setOfflineDictsList({ ...offlineDictsList });
        invoke<void>('download_dict', { abbr, appWindow })
          .then(() => {
            !downloadedDicts.length && setSelectedOfflineDict(abbr);
            downloadedDicts.push(abbr);
            setDownloadedDicts(downloadedDicts.slice());
            offlineDictsList[abbr].percentage = DOWNLOADED;
          })
          .catch(possibleErrOrCancelation => {
            console.error(possibleErrOrCancelation)
            offlineDictsList[abbr].percentage = NOT_DOWNLOADED;
          })
          .finally(() => setOfflineDictsList({ ...offlineDictsList }));
      } else {  //* to cancel
        emit('cancel_download', abbr);
      }
    }

    const langOptions = () => {
      return (Object.keys(offlineDictsList) as OfflineDictAbbrs[])
        .map(abbr => {
          const dict = offlineDictsList[abbr];
          const dlStatusIcon = dict.percentage === NOT_DOWNLOADED ? '/src/assets/download.svg' : dict.percentage === DOWNLOADED ? '/src/assets/delete.svg' : '/src/assets/cancel.svg';
          return (
            <div key={abbr} className={styles.dict}>
              <span>{dict.name} ({dict.volume} MB)</span>
              <div className={styles.download}>
                {dict.percentage !== -1 && dict.percentage !== 100 ? <span>{dict.percentage}%</span> : ''}
                <button
                  disabled={dict.percentage === WAIT_FOR_PROCESSING}
                  style={{
                    backgroundImage: `url(${dlStatusIcon})`,
                    backgroundSize: true ? '20px' : '25px',
                    opacity: dict.percentage === WAIT_FOR_PROCESSING ? '0.5' : '',
                    cursor: dict.percentage === WAIT_FOR_PROCESSING ? 'default' : '',
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