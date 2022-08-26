
import { invoke } from "@tauri-apps/api";
import { appWindow } from '@tauri-apps/api/window';
import { useEffect } from "react";
import { OfflineDict, OfflineDictsList } from "./App";
import styles from "./Modal.module.scss";

export const Modal: React.FC<{
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  downloadedDicts: OfflineDict[];
  setDownloadedDicts: React.Dispatch<React.SetStateAction<(OfflineDict)[]>>;
  offlineDictsList: OfflineDictsList;
  setOfflineDictsList: React.Dispatch<React.SetStateAction<OfflineDictsList>>;
}>
  = ({ setIsOpen, downloadedDicts, setDownloadedDicts, offlineDictsList, setOfflineDictsList }) => {
    useEffect(() => {
      downloadedDicts.forEach(dd => offlineDictsList[dd].percentage = 100);
      setOfflineDictsList({ ...offlineDictsList });
    }, []);

    const downloadCancelDelete = (name: OfflineDict) => {
      offlineDictsList[name].percentage = 0;
      setOfflineDictsList({ ...offlineDictsList });
      console.log('download for', name, 'started');
      invoke<string>('download_dict', { name, appWindow }).then((possibleErr) => console.log(possibleErr));
    }

    const langOptions = () => {
      return (Object.keys(offlineDictsList) as OfflineDict[])
        .map(k => {
          const dict = offlineDictsList[k];
          const dlStatusIcon = dict.percentage === -1 ? '/src/assets/download.svg' : dict.percentage === 100 ? '/src/assets/delete.svg' : '/src/assets/cancel.svg';
          return (
            <div key={k} className={styles.dict}>
              <span>{k} ({dict.volume} MB)</span>
              <div className={styles.download}>
                {dict.percentage !== -1 && dict.percentage !== 100 ? <span>{dict.percentage}%</span> : ''}
                <button
                  style={{
                    backgroundImage: `url(${dlStatusIcon})`,
                    backgroundSize: true ? '20px' : '25px'
                  }}
                  onClick={() => downloadCancelDelete(k)}
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