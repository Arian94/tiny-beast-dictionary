
import { offlineDictionaries } from "./countries";
import styles from "./Modal.module.scss";

type CountriesKeys = keyof typeof offlineDictionaries;

export const Modal: React.FC<{ setIsOpen: React.Dispatch<React.SetStateAction<boolean>> }> = ({ setIsOpen }): JSX.Element => {
  const langOptions = () => {
    const option = false ? 'src/assets/delete.svg' : '/src/assets/download.svg';
    return (Object.keys(offlineDictionaries) as CountriesKeys[])
      .map(dict => {
        return (
          <div key={dict} className={styles.dict}>
            <span>{dict}</span>
            <button
              style={{
                background: `url(${option}) no-repeat center`,
                backgroundSize: true ? '20px' : '25px'
              }}
            ></button>
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