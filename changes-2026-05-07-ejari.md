# EJARI Feature Update Log - 2026-05-07

This document captures the EJARI-related implementation and calibration updates completed today.

## Summary

A full EJARI workflow was added and iteratively refined:

- EJARI page/module integration in the app.
- Template-based PDF export using `public/ejari-template.pdf`.
- Manual coordinate mapping (non-AcroForm template).
- Validation and UX updates based on review feedback.
- Positioning calibration across sections and page 3 additional terms.

## Files Updated

- `app/components/EjariFormModule.vue`
- `app/pages/ejari-form.vue`
- `app/pages/index.vue`
- `app/components/AppTopNav.vue`

## Functional Additions

### 1. New EJARI Module and Navigation

- Added EJARI page route and module screen.
- Added dashboard entry and top-nav link for quick access.

### 2. Template-Based EJARI PDF Export

- Added export logic with `pdf-lib`.
- Loads `public/ejari-template.pdf`, overlays mapped values, and exports:
  - Opens PDF preview in a new tab.
  - Downloads stamped output file.

### 3. Section Mapping and Layout Refinement

- Mapped and calibrated Sections 1-4 fields.
- Removed custom visual rendering theme from export.
- Converted Property Usage output to circle-centered `X` marks.

### 4. Validation Changes

- Removed strict Emirates ID format validation.
- Removed strict phone format validation.
- Kept core required-field validation and email/date/amount checks.

### 5. Company Checkbox Cleanup

- Removed lessor and tenant "Incase of a Company" checkboxes from UI.
- Removed related state fields.
- Ensured no extra checkmark export is produced from those fields.

### 6. Checkmark Handling

- Fixed check alignment constants:
  - `checkXOffset: 20`
  - `checkYOffset: 35`
- Removed check-offset localStorage and runtime offset controls.
- Removed mode-of-payment checkbox rendering to eliminate stray marks.
- Mode of payment remains exported as text.

### 7. Additional Terms on Page 3

- Added Section 5 in UI with 5 new inputs:
  - `additionalTerm1`
  - `additionalTerm2`
  - `additionalTerm3`
  - `additionalTerm4`
  - `additionalTerm5`
- Added page-3 mapping logic and coordinates for five lines.
- Final calibrated top positions:
  - 80, 88, 96, 104, 112 (mm from top, before fixed text Y offset)

## Key Implementation Notes

- `FIXED_TEXT_ALIGNMENT` remains:
  - `xOffset: 20`
  - `yOffset: 35`
- Template has no usable AcroForm fields in this workflow, so placement is manual by coordinates.
- Export uses page 1 for sections 1-4 and page 3 for Additional Terms.

## Current State

- Component diagnostics are clean for EJARI module file.
- Project build completed successfully (`npm run build`).

## Follow-Up Recommendations

- Perform one final visual QA pass on page 3 line baselines with real data.
- If needed, tune Additional Terms Y positions by ±1 mm.
- If template revisions occur, maintain a dedicated coordinate table in this document.
