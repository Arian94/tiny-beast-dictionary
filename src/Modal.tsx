
import styles from "./Modal.module.scss";

export const Modal: React.FC<{ setIsOpen: React.Dispatch<React.SetStateAction<boolean>> }> = ({ setIsOpen }): JSX.Element => {
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
            <div className={styles.dict}>
              <span>English</span>
            </div>
            <div className={styles.dict}>
              <span>French</span>
            </div>
            <div className={styles.dict}>
              <span>German</span>
            </div>
            <div className={styles.dict}>
              <span>Spanish</span>
            </div>
            <div className={styles.dict}>
              <span>Italian</span>
            </div>
            <div className={styles.dict}>
              <span>Persian</span>
            </div>
            <div className={styles.dict}>
              <span>Arabic</span>
            </div>
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