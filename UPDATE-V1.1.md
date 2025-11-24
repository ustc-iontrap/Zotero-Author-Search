# Zotero Author Search Plugin - V1.1 Update Summary

## Version Information
- **Version**: 1.1.0
- **Release Date**: 2025.11.24
- **Previous Version**: 1.0.0

## Overview
This document summarizes the changes made in version V1.1 of the Zotero Author Search Plugin. This release focuses on enhancing interactivity and usability with new features for navigation, data export, and search control.

## What's New in V1.1

### 1. Interactive Links (↗)
- **Clickable Arrow Icons**: Added arrow icons (↗) next to each search result title
- **Direct Navigation**: Click the arrow to jump directly to the item in Zotero using `zotero://select/` protocol
- **Note Links**: Generated notes also include clickable links to items
- **Improved Workflow**: Faster navigation without manual searching

### 2. Copy to Clipboard
- **New "Copy" Button**: Format and copy all search results to system clipboard
- **Structured Format**: Exports as "Title - Authors - Journal (Year)"
- **Batch Export**: Copy all results at once
- **Multi-use**: Paste into documents, emails, or other applications

### 3. Add Note Feature
- **Create Child Notes**: Generates a formatted HTML note under the original item
- **HTML List Format**: Results displayed as an organized HTML list
- **Clickable Links**: Each note entry contains a zotero:// link
- **Permanent Record**: Search results saved for future reference

### 4. Multiple Matching Modes
- **Flexible Mode**: Allows initial/partial first-name matches (default)
- **Strict Mode**: Requires exact first and last name matches
- **Surname Mode**: Matches last names only
- **Right-click Submenu**: Choose mode from context menu

## Files Updated

### In `author-search-github/` Directory:
1. **package.json**
   - Version updated to 1.1.0 ✅

2. **README.md**
   - Added "What's New in V1.1" section
   - Removed "Enhanced UI: sticky header" mention (feature not implemented)
   - Updated Features section
   - Updated Usage instructions with matching modes
   - Updated Development Notes

### In Root Directory:
1. **package.json**
   - Version updated from 1.0.0 to 1.1.0 ✅

2. **README-plugin.md**
   - Added "What's New in V1.1" section
   - Updated Features list
   - Updated Usage instructions with three matching modes
   - Updated Result Interactions section
   - Updated Author Matching Rules with mode descriptions
   - Added troubleshooting for clickable links
   - Updated version to 1.1.0
   - Added v1.1.0 changelog entry

3. **使用说明.md** (Chinese Documentation)
   - Added "V1.1 版本新功能" section
   - Updated Features list
   - Updated Usage instructions
   - Updated Result Interactions
   - Updated Matching Rules with three modes
   - Added troubleshooting for clickable links
   - Updated version to 1.1.0
   - Added v1.1.0 changelog entry

4. **版本更新说明.md** (Version History - Chinese)
   - Complete rewrite for V1.1
   - Detailed new features documentation
   - Usage scenarios and examples
   - Feature comparison table (v1.0.0 vs v1.1.0)
   - Technical improvements documentation
   - Upgrade guide

## Key Features Comparison

| Feature | V1.0.0 | V1.1.0 |
|---------|--------|--------|
| Author Search | ✅ | ✅ |
| Search Results Display | ✅ | ✅ |
| Save as Collection | ✅ | ✅ |
| Interactive Links | ❌ | ✅ |
| Copy to Clipboard | ❌ | ✅ |
| Add Note | ❌ | ✅ |
| Multiple Matching Modes | ❌ | ✅ |
| Submenu Navigation | ❌ | ✅ |

## Notable Omissions
The following feature was mentioned in earlier versions but was **NOT included** in the V1.1 documentation as it was not successfully implemented:
- **Enhanced UI: Sticky Header** - The feature to keep action buttons accessible while scrolling through long lists was not implemented

## Technical Details

### New UI Components
- Arrow icon (↗) for direct navigation
- Copy button for clipboard export
- Add Note button for note generation
- Submenu in context menu for matching modes

### New Functionality
- `zotero://select/` link generation
- Clipboard API integration
- HTML note creation with parent-child relationship
- Multiple matching algorithm modes

### API Enhancements
- Clipboard write support
- Note creation API
- URI scheme handling for zotero:// links

## Documentation Standards
All documentation updates follow these principles:
1. Bilingual support (English and Chinese)
2. Clear feature descriptions with examples
3. Usage scenarios and recommendations
4. Troubleshooting sections
5. Developer information updates

## Compatibility
- **Zotero Version**: 7+
- **Plugin ID**: authorsearch@euclpts.com
- **Backward Compatibility**: Fully compatible with v1.0.0
- **Breaking Changes**: None

## Installation Notes
Users can upgrade from v1.0.0 to v1.1.0 by:
1. Downloading the new `author-search.xpi`
2. Installing directly (Zotero will auto-update)
3. Restarting Zotero
4. No data loss or configuration changes required

## Testing Recommendations
Before release, verify:
- [ ] All four new features work correctly
- [ ] Interactive links navigate to correct items
- [ ] Copy function formats data properly
- [ ] Notes are created with correct HTML and links
- [ ] All three matching modes produce expected results
- [ ] Bilingual interface works in both languages
- [ ] No regressions from v1.0.0 functionality

## Future Considerations
Potential features for future versions:
- Sticky header implementation (deferred from v1.1)
- Export to different formats (CSV, BibTeX, etc.)
- Custom matching rule configuration
- Search history tracking
- Batch operations on multiple items

---

**Update Completed**: All files in the github folder have been updated to version V1.1
**Date**: 2025.11.24
**Status**: Ready for release