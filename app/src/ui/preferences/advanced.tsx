import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { UncommittedChangesStrategyKind } from '../../models/uncommitted-changes-strategy'
import { RadioButton } from '../lib/radio-button'

interface IProps {
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
  readonly repositoryIndicatorsEnabled: boolean
  readonly onUncommittedChangesStrategyKindChanged: (
    value: UncommittedChangesStrategyKind
  ) => void
  readonly onRepositoryIndicatorsEnabledChanged: (enabled: boolean) => void
}

interface IAdvancedPreferencesState {
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

export class Advanced extends React.Component<
  IProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IProps) {
    super(props)

    this.state = {
      uncommittedChangesStrategyKind: this.props.uncommittedChangesStrategyKind,
    }
  }

  private onUncommittedChangesStrategyKindChanged = (
    value: UncommittedChangesStrategyKind
  ) => {
    this.setState({ uncommittedChangesStrategyKind: value })
    this.props.onUncommittedChangesStrategyKindChanged(value)
  }

  private onRepositoryIndicatorsEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onRepositoryIndicatorsEnabledChanged(event.currentTarget.checked)
  }

  public render() {
    return (
      <DialogContent>
        <div className="advanced-section">
          <h2>If I have changes and I switch branches...</h2>

          <RadioButton
            value={UncommittedChangesStrategyKind.AskForConfirmation}
            checked={
              this.state.uncommittedChangesStrategyKind ===
              UncommittedChangesStrategyKind.AskForConfirmation
            }
            label="Ask me where I want the changes to go"
            onSelected={this.onUncommittedChangesStrategyKindChanged}
          />

          <RadioButton
            value={UncommittedChangesStrategyKind.MoveToNewBranch}
            checked={
              this.state.uncommittedChangesStrategyKind ===
              UncommittedChangesStrategyKind.MoveToNewBranch
            }
            label="Always bring my changes to my new branch"
            onSelected={this.onUncommittedChangesStrategyKindChanged}
          />

          <RadioButton
            value={UncommittedChangesStrategyKind.StashOnCurrentBranch}
            checked={
              this.state.uncommittedChangesStrategyKind ===
              UncommittedChangesStrategyKind.StashOnCurrentBranch
            }
            label="Always stash and leave my changes on the current branch"
            onSelected={this.onUncommittedChangesStrategyKindChanged}
          />
        </div>
        <div className="advanced-section">
          <h2>Background updates</h2>
          <Checkbox
            label="Periodically fetch and refresh status of all repositories"
            value={
              this.props.repositoryIndicatorsEnabled
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onRepositoryIndicatorsEnabledChanged}
          />
          <p className="git-settings-description">
            Allows the display of up-to-date status indicators in the repository
            list. Disabling this may improve performance with many repositories.
          </p>
        </div>
      </DialogContent>
    )
  }
}
