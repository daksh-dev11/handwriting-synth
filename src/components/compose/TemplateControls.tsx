import { useAppStore } from '../../store/useAppStore';
import type { TemplateId } from '@engine';
import styles from './Controls.module.css';

const templates: readonly { id: TemplateId; label: string; caption?: string }[] = [
  { id: 'ruled', label: 'Ruled' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'cornell', label: 'Cornell', caption: 'Lines only — no text labels.' },
];

export function TemplateControls() {
  const selected = useAppStore((state) => state.template);
  const setTemplate = useAppStore((state) => state.setTemplate);
  const readOnly = useAppStore((state) => state.readOnly);
  return (
    <section className={styles.group} aria-labelledby="template-heading">
      <h2 id="template-heading">Page template</h2>
      <div className={styles.templateGrid} role="radiogroup" aria-label="Page template">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={selected === template.id}
            className={[styles.template, selected === template.id ? styles.selected : ''].filter(Boolean).join(' ')}
            disabled={readOnly}
            title={template.caption}
            onClick={() => setTemplate(template.id)}
          >
            <span className={[styles.miniSheet, styles[template.id]].join(' ')} aria-hidden="true" />
            <span>{template.label}</span>
          </button>
        ))}
      </div>
      <p className={styles.caption}>Cornell uses lines only — no text labels.</p>
    </section>
  );
}
