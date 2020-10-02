import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { renderBranchHasRemoteWarning, renderStashWillBeLostWarning } from '../lib/branch-name-warnings'
import { IStashEntry } from '../../models/stash-entry'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IRenameBranchProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repository: Repository
  readonly branch: Branch
  readonly stash: IStashEntry | null
}

interface IRenameBranchState {
  readonly newName: string
  readonly alsoRenameRemote: boolean
}

export class RenameBranch extends React.Component<
  IRenameBranchProps,
  IRenameBranchState
> {
  public constructor(props: IRenameBranchProps) {
    super(props)

    this.state = {
      newName: props.branch.name,
      alsoRenameRemote: false
    }
  }

  private onCheckboxChange = (isChecked: boolean) => {
    this.setState({alsoRenameRemote: isChecked})
  }

  public render() {
    return (
      <Dialog
        id="rename-branch"
        title="Rename branch"
        onDismissed={this.props.onDismissed}
        onSubmit={this.renameBranch}
      >
        <DialogContent>
          <RefNameTextBox
            label="Name"
            initialValue={this.props.branch.name}
            onValueChange={this.onNameChange}
          />
          <Checkbox
            value={this.state.alsoRenameRemote ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onCheckboxChange}
          />
          {renderBranchHasRemoteWarning(this.props.branch)}
          {renderStashWillBeLostWarning(this.props.stash)}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={`Rename ${this.props.branch.name}`}
            okButtonDisabled={this.state.newName.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChange = (name: string) => {
    this.setState({ newName: name })
  }

  private renameBranch = () => {
    this.props.dispatcher.renameBranch(
      this.props.repository,
      this.props.branch,
      this.state.newName,
      this.state.alsoRenameRemote
    )
    this.props.onDismissed()
  }
}
