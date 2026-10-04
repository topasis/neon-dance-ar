## ADDED Requirements

### Requirement: Per-landmark override hook
The renderer SHALL let a caller register a draw function for a keypoint index, which replaces the default joint
drawing for that keypoint on every instance.

#### Scenario: Override registered
- **WHEN** an override is registered for keypoint 0 (nose)
- **THEN** for each visible instance with a confident nose, the function is called with the context translated to
  the nose's canvas position
- **AND** the default nose joint circle isn't drawn
- **AND** the context transform is restored afterwards

#### Scenario: Override cleared
- **WHEN** the override for keypoint 0 is cleared
- **THEN** the default joint circle is drawn again

### Requirement: Instance decorators
The renderer SHALL call each registered decorator once per visible instance after bones and joints.

#### Scenario: Face circle as decorator
- **WHEN** the app starts
- **THEN** the face circle is drawn through a registered decorator and looks the same as before the change

### Requirement: Inference untouched by rendering extensions
Registering overrides or decorators SHALL NOT require changes to the inference or tracking code.

#### Scenario: Phase 3 asset
- **WHEN** a Phase 3 asset is attached to a landmark through the override hook
- **THEN** no file under `js/services/` or `js/logic/` changes
