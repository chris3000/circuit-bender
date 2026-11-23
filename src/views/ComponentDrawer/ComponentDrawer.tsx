import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import {
  buildCatalog, groupItems, resolveItem, searchCatalog, shelfName,
  type ShelfBlock, type ShelfItem, type ShelfSection,
} from './catalog';
import { ShelfTile } from './ShelfTile';
import { MAX_RECENT, toggled, useShelfPrefs } from './shelfPrefs';
import styles from './ComponentDrawer.module.css';

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

/**
 * The parts shelf. Built to hold many parts: everything on it comes from the
 * part definitions, a part that comes in values shows its common ones until
 * the rest are asked for, and the search finds a part by name, by what it is
 * for, or by value — including values that are not stocked.
 */
export function ComponentDrawer() {
  const registry = ComponentRegistry.getInstance();
  const definitions = useMemo(() => registry.listAll(), [registry]);
  const catalog = useMemo(() => buildCatalog(definitions), [definitions]);
  const sections = useMemo(() => groupItems(catalog), [catalog]);

  const [prefs, setPrefs] = useShelfPrefs();
  const [query, setQuery] = useState('');
  const searchBox = useRef<HTMLInputElement>(null);
  const [wantSearch, setWantSearch] = useState(false);

  const results = useMemo(() => (query.trim() ? searchCatalog(catalog, query) : null), [catalog, query]);
  const resultSections = useMemo(() => (results ? groupItems(results) : []), [results]);
  const recent = useMemo(
    () => prefs.recent.map((key) => resolveItem(key, definitions)).filter((item): item is ShelfItem => item !== null),
    [prefs.recent, definitions],
  );

  const used = useCallback((key: string) => {
    setPrefs((p) => ({ ...p, recent: [key, ...p.recent.filter((k) => k !== key)].slice(0, MAX_RECENT) }));
  }, [setPrefs]);

  // "/" goes to the search from anywhere, unfolding the shelf if need be
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTextField(e.target)) return;
      e.preventDefault();
      setPrefs((p) => (p.hidden ? { ...p, hidden: false } : p));
      setWantSearch(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPrefs]);
  useEffect(() => {
    if (!wantSearch) return;
    searchBox.current?.focus();
    searchBox.current?.select();
    setWantSearch(false);
  }, [wantSearch]);

  if (prefs.hidden) {
    return (
      <aside className={styles.strip} data-testid="component-drawer" aria-label="Parts">
        <button className={styles.stripButton} aria-expanded={false} aria-label="Show the parts shelf" title="Show parts ( / )"
          onClick={() => setPrefs((p) => ({ ...p, hidden: false }))}>
          <span aria-hidden="true">&raquo;</span>
          <span className={styles.stripLabel}>Parts</span>
        </button>
      </aside>
    );
  }

  const block = (b: ShelfBlock, searching: boolean) => {
    if (b.kind === 'parts') {
      return (
        <div className={styles.parts} role="list" key={b.items[0].key}>
          {b.items.map((item) => <ShelfTile key={item.key} item={item} onUsed={used} />)}
        </div>
      );
    }
    const type = b.definition.type;
    const common = b.items.filter((item) => item.common);
    const canFold = !searching && common.length > 0 && common.length < b.items.length;
    const open = prefs.open.includes(type);
    const shown = canFold && !open ? common : b.items;
    return (
      <div className={styles.values} key={type} data-testid={`shelf-values-${type}`}>
        <div className={styles.valuesHead}>
          <span className={styles.valuesName}>{shelfName(b.definition)}</span>
          {canFold && (
            <button className={styles.more} aria-expanded={open}
              onClick={() => setPrefs((p) => ({ ...p, open: toggled(p.open, type) }))}>
              {open ? 'Common values' : `All ${b.items.length} values`}
            </button>
          )}
        </div>
        <div className={styles.grid} role="list">
          {shown.map((item) => <ShelfTile key={item.key} item={item} onUsed={used} />)}
        </div>
      </div>
    );
  };

  const section = (s: ShelfSection, searching: boolean) => {
    const open = searching || !prefs.closed.includes(s.category);
    return (
      <section key={s.category} data-testid={`shelf-section-${s.category}`}>
        <h3 className={styles.sectionTitle}>
          {searching ? (
            <span className={styles.sectionHead}>{s.label}<span className={styles.count}>{s.count}</span></span>
          ) : (
            <button className={styles.sectionHead} aria-expanded={open}
              onClick={() => setPrefs((p) => ({ ...p, closed: toggled(p.closed, s.category) }))}>
              {s.label}
              <span className={styles.count}>{s.count}</span>
              <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">&#9654;</span>
            </button>
          )}
        </h3>
        {open && <div className={styles.body}>{s.blocks.map((b) => block(b, searching))}</div>}
      </section>
    );
  };

  return (
    <aside className={styles.shelf} data-testid="component-drawer" aria-label="Parts">
      <div className={styles.top}>
        <div className={styles.heading}>
          <span className={styles.name}>Parts</span>
          <span className={styles.total} title={`${catalog.length} parts and values in stock`}>{catalog.length}</span>
          <button className={styles.fold} aria-expanded aria-label="Hide the parts shelf" title="Hide parts"
            onClick={() => setPrefs((p) => ({ ...p, hidden: true }))}>&laquo;</button>
        </div>
        <div className={styles.search}>
          <input ref={searchBox} type="text" value={query} aria-label="Search parts"
            placeholder="Find a part or value: 47k" spellCheck={false} autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              if (query) setQuery(''); else e.currentTarget.blur();
            }} />
          {query && (
            <button className={styles.clear} aria-label="Clear search"
              onClick={() => { setQuery(''); searchBox.current?.focus(); }}>&times;</button>
          )}
        </div>
      </div>

      <div className={styles.scroll}>
        {results ? (
          <>
            <p className={styles.status} role="status">
              {results.length === 0
                ? <>Nothing matches <b>{query.trim()}</b>. Try a part&rsquo;s name, or a value such as 47k or 100n.</>
                : `${results.length} ${results.length === 1 ? 'match' : 'matches'}`}
            </p>
            {resultSections.map((s) => section(s, true))}
          </>
        ) : (
          <>
            {recent.length > 0 && (
              <section data-testid="shelf-section-recent">
                <h3 className={styles.sectionTitle}><span className={styles.sectionHead}>Recent</span></h3>
                <div className={styles.body}>
                  <div className={styles.mixed} role="list">
                    {recent.map((item) => <ShelfTile key={item.key} item={item} onUsed={used} compact />)}
                  </div>
                </div>
              </section>
            )}
            {sections.map((s) => section(s, false))}
          </>
        )}
      </div>
    </aside>
  );
}
