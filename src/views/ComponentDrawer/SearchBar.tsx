import styles from './SearchBar.module.css';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className={styles.container}>
      <input
        className={styles.input}
        type="text"
        placeholder="Search components..."
        aria-label="Search components"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
