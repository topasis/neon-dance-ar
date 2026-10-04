## ADDED Requirements

### Requirement: Looks made of shapes anchored to the body
The renderer SHALL draw each tracked person using a look: a list of shape and stroke items defined on the model
pose and mapped onto the person's live keypoints.

#### Scenario: Shape follows its bone
- **WHEN** a look has glasses placed over the eyes of the model pose
- **AND** the person tilts their head and moves away from the camera
- **THEN** the glasses stay over the eyes, rotate with the head and shrink with the eye distance

#### Scenario: Freehand stroke bends at joints
- **WHEN** a stroke is drawn along the upper arm and forearm of the model pose
- **AND** the person bends their elbow
- **THEN** each part of the stroke follows its own bone and the stroke bends at the elbow

#### Scenario: Missing keypoints
- **WHEN** a bone's endpoints aren't confident (score ≤ `MIN_CONFIDENCE`)
- **THEN** items anchored to that bone aren't drawn for that frame, and the rest of the look still is

### Requirement: Per-person looks with a default
The app SHALL keep a look for each of 5 person slots. Slots without a custom look SHALL use the default look in the
person's own neon color.

#### Scenario: Mixed custom and default
- **WHEN** Person 1 has a custom look and Person 2 has none
- **THEN** Person 1 is drawn with the custom look
- **AND** Person 2 is drawn with the default skeleton and head ring in their own auto-assigned color

#### Scenario: Stable slot
- **WHEN** a person stays tracked across frames
- **THEN** their slot, and therefore their look, doesn't change

### Requirement: Body editor
The app SHALL provide an editor that shows the model pose. In it, the user can place predefined shapes, draw
freehand strokes, and select, move, scale, rotate, recolor and delete items for a chosen person slot.

#### Scenario: Place a shape
- **WHEN** the user picks "Circle" and taps the left knee of the model
- **THEN** a circle appears there and is selected, and the live view shows it on that person's left knee

#### Scenario: Start from a preset
- **WHEN** the user loads the "Party" preset for Person 3
- **THEN** Person 3's look becomes an editable copy of Party, and the preset itself is unchanged

#### Scenario: Back to default
- **WHEN** the user chooses "Use default" for a slot
- **THEN** that slot's custom look is removed and the default look is used

### Requirement: Presets as data
Predefined looks (Classic, Glow Sticks, Party, EL Suit) SHALL be in the same item format the editor produces.

#### Scenario: Classic matches the old renderer
- **WHEN** no custom looks exist
- **THEN** every person is drawn with the Classic look, which looks like the previous skeleton, joints and face ring

### Requirement: Looks persist locally
Custom looks SHALL be saved to browser storage and restored on reload. The app SHALL work with defaults when
storage is unavailable.

#### Scenario: Reload
- **WHEN** the user customizes Person 1 and reloads the page
- **THEN** Person 1's look is restored

#### Scenario: Storage blocked
- **WHEN** `localStorage` throws or holds invalid data
- **THEN** the app starts normally and every person uses the default look
