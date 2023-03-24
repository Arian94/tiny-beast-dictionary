
import { invoke } from "@tauri-apps/api";
import { emit } from "@tauri-apps/api/event";
import { appWindow } from '@tauri-apps/api/window';
import { useEffect, useMemo } from "react";
import { cancelIcon, deleteIcon, downloadIcon } from "../../../assets/images";
import { OfflineDictAbbrs, OfflineDictsList } from "../../../models/offline-mode";
import styles from "./Modal.module.scss";

export const NOT_DOWNLOADED = -2;
const DOWNLOAD_STARTED = -1;
const WAIT_FOR_PROCESSING = 100;
const DOWNLOADED = 101;

export const Modal: React.FC<{
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  downloadedDicts: OfflineDictAbbrs[];
  setDownloadedDicts: React.Dispatch<React.SetStateAction<(OfflineDictAbbrs)[]>>;
  offlineDictsList: OfflineDictsList;
  setOfflineDictsList: React.Dispatch<React.SetStateAction<OfflineDictsList>>;
  selectedOfflineDict?: OfflineDictAbbrs;
  setSelectedOfflineDict: React.Dispatch<React.SetStateAction<OfflineDictAbbrs | undefined>>;
  emitNewConfig: (selectedOfflineDict?: OfflineDictAbbrs, downloadedDicts?: OfflineDictAbbrs[]) => Promise<void>
}>
  = ({ setIsOpen, downloadedDicts, setDownloadedDicts, offlineDictsList, setOfflineDictsList, selectedOfflineDict, setSelectedOfflineDict, emitNewConfig }) => {
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
            if (abbr === selectedOfflineDict) {
              selectedOfflineDict = downloadedDicts[0] || null;
              setSelectedOfflineDict(selectedOfflineDict);
            }
            emitNewConfig(selectedOfflineDict, downloadedDicts.slice());
            setOfflineDictsList({ ...offlineDictsList });
          })
          .catch(e => console.error(e))
      } else if (offlineDictsList[abbr].percentage === NOT_DOWNLOADED) {  //* to download
        // console.log('download for', abbr, 'started');
        offlineDictsList[abbr].percentage = DOWNLOAD_STARTED;
        setOfflineDictsList({ ...offlineDictsList });
        invoke<void>('download_dict', { abbr, appWindow })
          .then(() => {
            if (!downloadedDicts.length) {
              selectedOfflineDict = abbr;
              setSelectedOfflineDict(selectedOfflineDict);
            }
            downloadedDicts.push(abbr);
            setDownloadedDicts(downloadedDicts.slice());
            emitNewConfig(selectedOfflineDict, downloadedDicts.slice());
            offlineDictsList[abbr].percentage = DOWNLOADED;
          })
          .catch(possibleErrOrCancelation => {
            console.error('error for', abbr, possibleErrOrCancelation)
            offlineDictsList[abbr].percentage = NOT_DOWNLOADED;
          })
          .finally(() => setOfflineDictsList({ ...offlineDictsList }));
      } else {  //* to cancel
        emit(`cancel_download_${abbr}`);
      }
    }

    const langOptions = () => {
      return (Object.keys(offlineDictsList) as OfflineDictAbbrs[])
        .map(abbr => {
          const dict = offlineDictsList[abbr];
          const dlStatusIcon = dict.percentage === NOT_DOWNLOADED ? downloadIcon : dict.percentage === DOWNLOADED ? deleteIcon : cancelIcon;
          return (
            <div key={abbr} className={styles.item}>
              <span>{dict.name} <small>(D: {dict.zipped}, I: {dict.extracted})</small></span>
              <div className={styles.download}>
                {dict.percentage !== NOT_DOWNLOADED && dict.percentage !== DOWNLOADED &&
                  <span>
                    {dict.percentage === WAIT_FOR_PROCESSING ? <h6>processing</h6> : dict.percentage === DOWNLOAD_STARTED ? <h6>initializing</h6> : `${dict.percentage}%`}
                  </span>
                }
                <button
                  disabled={dict.percentage === WAIT_FOR_PROCESSING}
                  style={{
                    backgroundImage: `url(${dlStatusIcon})`,
                    backgroundSize: '20px',
                    opacity: dict.percentage === WAIT_FOR_PROCESSING ? '0.5' : '',
                    cursor: dict.percentage === WAIT_FOR_PROCESSING ? 'default' : '',
                  }}
                  onClick={() => downloadCancelDelete(abbr)}>
                </button>
              </div>
            </div>
          )
        })
    }

    const langs = useMemo(() => langOptions(), [offlineDictsList]);

    return (
      <>
        <div className={`modal-bg ${styles.darkBg}`} onClick={() => setIsOpen(false)} />
        <div className={`modal ${styles.modal}`}>
          <div className={`modal-header ${styles.modalHeader}`}>
            <h4 className={styles.heading}>Resources</h4>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>X</button>
          </div>

          <div className={`modal-content ${styles.modalContent}`}>
            <div className={styles.title}>
              List of available dictionaries:
              <small>File Sizes: Download: D - Installed: I</small>
            </div>
            <div className={styles.dictItems}>
              {langs}
            </div>

            <span style={{ display: 'block', fontSize: '.8rem', marginTop: '.4rem', color: 'rgb(var(--warning))' }}>
              Installation takes intensive CPU usage.
            </span>
          </div>

          <div className={`modal-actions ${styles.modalActions}`}>
            <button className={styles.cancelBtn} onClick={() => setIsOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  };