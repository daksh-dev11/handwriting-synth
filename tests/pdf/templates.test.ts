import { BACKDROP, K, PAGE, TEMPLATE_SPECS } from '@engine';
import { describe, expect, it } from 'vitest';
import { EMITTERS } from '../../src/pdf/templates';
import { fmt } from '../../src/pdf/num';
import { hex2rg } from '../../src/pdf/templates/shared';

describe('PDF template operators', () => {
  it('emits the exact ruled-page operators', () => {
    const spec = TEMPLATE_SPECS.ruled;
    const expected = [
      'q',
      `${hex2rg(BACKDROP.ruleRgb)} RG`,
      `${fmt(BACKDROP.ruleWidthPt, 2)} w`,
    ];
    for (let i = 0; i < spec.linesPerPage; i++) {
      const y = PAGE.heightPt - (spec.firstBaselineFromTopPt + i * spec.linePitchPt);
      expected.push(`${fmt(BACKDROP.ruleX0Pt, 2)} ${fmt(y, 2)} m ${fmt(BACKDROP.ruleX1Pt, 2)} ${fmt(y, 2)} l S`);
    }
    expected.push(
      `${hex2rg(BACKDROP.marginRgb)} RG`,
      `${fmt(BACKDROP.marginWidthPt, 2)} w`,
      `${fmt(BACKDROP.marginXPt, 2)} 0 m ${fmt(BACKDROP.marginXPt, 2)} ${fmt(PAGE.heightPt, 2)} l S`,
      'Q',
    );
    expect(EMITTERS.ruled(spec)).toBe(expected.join('\n'));
  });

  it('emits the exact interior grid lines', () => {
    const pitch = BACKDROP.gridPitchPt;
    const expected = ['q', `${hex2rg(BACKDROP.gridRgb)} RG`, `${fmt(BACKDROP.gridWidthPt, 2)} w`];
    for (let i = 1; i < Math.floor(PAGE.widthPt / pitch); i++) {
      const x = i * pitch;
      expected.push(`${fmt(x, 2)} 0 m ${fmt(x, 2)} ${fmt(PAGE.heightPt, 2)} l S`);
    }
    for (let j = 1; j < Math.floor(PAGE.heightPt / pitch); j++) {
      const y = PAGE.heightPt - j * pitch;
      expected.push(`0 ${fmt(y, 2)} m ${fmt(PAGE.widthPt, 2)} ${fmt(y, 2)} l S`);
    }
    expected.push('Q');
    expect(EMITTERS.grid(TEMPLATE_SPECS.grid)).toBe(expected.join('\n'));
  });

  it('emits every dotted circle as the specified four-cubic fill', () => {
    const pitch = BACKDROP.gridPitchPt;
    const radius = BACKDROP.dotRadiusPt;
    const c = K.KAPPA * radius;
    const expected = ['q', `${hex2rg(BACKDROP.dotRgb)} rg`];
    for (let i = 1; i < Math.floor(PAGE.widthPt / pitch); i++) {
      const cx = i * pitch;
      for (let j = 1; j < Math.floor(PAGE.heightPt / pitch); j++) {
        const cy = PAGE.heightPt - j * pitch;
        expected.push(
          `${fmt(cx + radius, 2)} ${fmt(cy, 2)} m ` +
          `${fmt(cx + radius, 2)} ${fmt(cy + c, 2)} ${fmt(cx + c, 2)} ${fmt(cy + radius, 2)} ${fmt(cx, 2)} ${fmt(cy + radius, 2)} c ` +
          `${fmt(cx - c, 2)} ${fmt(cy + radius, 2)} ${fmt(cx - radius, 2)} ${fmt(cy + c, 2)} ${fmt(cx - radius, 2)} ${fmt(cy, 2)} c ` +
          `${fmt(cx - radius, 2)} ${fmt(cy - c, 2)} ${fmt(cx - c, 2)} ${fmt(cy - radius, 2)} ${fmt(cx, 2)} ${fmt(cy - radius, 2)} c ` +
          `${fmt(cx + c, 2)} ${fmt(cy - radius, 2)} ${fmt(cx + radius, 2)} ${fmt(cy - c, 2)} ${fmt(cx + radius, 2)} ${fmt(cy, 2)} c f`,
        );
      }
    }
    expected.push('Q');
    expect(EMITTERS.dotted(TEMPLATE_SPECS.dotted)).toBe(expected.join('\n'));
    expect(EMITTERS.dotted(TEMPLATE_SPECS.dotted).length).toBeGreaterThan(50_000);
  });

  it('emits exact Cornell rules without text operators', () => {
    const spec = TEMPLATE_SPECS.cornell;
    const expected = ['q', `${hex2rg(BACKDROP.ruleRgb)} RG`, `${fmt(BACKDROP.ruleWidthPt, 2)} w`];
    for (let i = 0; i < spec.linesPerPage; i++) {
      const y = PAGE.heightPt - (spec.firstBaselineFromTopPt + i * spec.linePitchPt);
      expected.push(
        `${fmt(BACKDROP.cornellCueDividerXPt, 2)} ${fmt(y, 2)} m ` +
        `${fmt(BACKDROP.ruleX1Pt, 2)} ${fmt(y, 2)} l S`,
      );
    }
    expected.push(
      `${fmt(BACKDROP.marginWidthPt, 2)} w`,
      `${fmt(BACKDROP.cornellCueDividerXPt, 2)} ${fmt(PAGE.heightPt - BACKDROP.cornellTopPt, 2)} m ` +
      `${fmt(BACKDROP.cornellCueDividerXPt, 2)} ${fmt(PAGE.heightPt - BACKDROP.cornellSummaryRuleYPt, 2)} l S`,
      `${fmt(BACKDROP.ruleX0Pt, 2)} ${fmt(PAGE.heightPt - BACKDROP.cornellSummaryRuleYPt, 2)} m ` +
      `${fmt(BACKDROP.ruleX1Pt, 2)} ${fmt(PAGE.heightPt - BACKDROP.cornellSummaryRuleYPt, 2)} l S`,
      'Q',
    );
    const operators = EMITTERS.cornell(spec);
    expect(operators).toBe(expected.join('\n'));
    expect(operators).not.toMatch(/\b(?:BT|Tj)\b/);
  });
});
