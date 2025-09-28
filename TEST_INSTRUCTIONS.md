# Testing Instructions for Music Editor Features

## Features Implemented

### 1. Note Highlighting During Playback
- Notes now highlight in blue as they are played
- The highlighting follows the actual playback timing
- Uses CSS animations for smooth visual feedback

### 2. Interactive Note Editing (Drag & Drop)
- Click and drag any note up or down to change its pitch
- Visual feedback shows the note being dragged
- The ABC notation updates automatically when you release the mouse

## How to Test

### Testing Playback Highlighting:
1. Start the development server: `npm run dev`
2. Navigate to the app and generate or input some ABC notation
3. Click the Play button
4. Watch as notes highlight in blue as they play

### Testing Drag & Drop Note Editing:
1. Make sure you're in Visual or Split view mode
2. Hover over any note - cursor should change to indicate it's draggable
3. Click and hold on a note
4. Drag up to increase pitch (move to higher staff position)
5. Drag down to decrease pitch (move to lower staff position)
6. Release mouse to apply the change
7. The ABC notation will update automatically

## Technical Details

### Playback Implementation:
- Uses ABCJS TimingCallbacks when available for precise synchronization
- Falls back to time-based estimation if TimingCallbacks not available
- CSS classes: `abcjs-highlight` and `playing` are applied to active notes

### Drag & Drop Implementation:
- Detects all note elements including noteheads (ellipses)
- Calculates pitch changes based on vertical movement
- Updates ABC notation string directly
- Maintains note duration and accidentals during pitch changes

## Known Limitations:
- Drag sensitivity is calibrated for standard staff spacing
- Complex chords may not drag as expected
- Very fast passages might show slight timing delays in highlighting

## Troubleshooting:

If playback highlighting doesn't work:
- Check browser console for errors
- Ensure ABC notation is valid
- Try refreshing the page

If drag and drop doesn't work:
- Make sure you're not in read-only mode
- Ensure playback is stopped
- Check that you're clicking directly on a note element