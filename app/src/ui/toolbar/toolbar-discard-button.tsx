import * as React from 'react'
import { OcticonSymbol } from '../octicons'
import { ToolbarButton } from './button'
import { connect, IGlobalState } from '../index'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { WorkingDirectoryFileChange } from '../../models/status'

interface IProps {
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  readonly dispatcher: Dispatcher
  readonly repository: Repository | null
}

const mapStateToProps = (state: IGlobalState): IProps => ({
  files: state.appStore.possibleSelectedState?.state?.changesState?.workingDirectory.files || [],
  dispatcher: state.dispatcher,
  repository: state.appStore.getRepository()
})

class LocalToolbarDiscardButton extends React.Component<IProps> {
  public shouldComponentUpdate(
    nextProps: Readonly<IProps>,
    nextState: Readonly<{}>,
    nextContext: any): boolean {
    return nextProps.files.length !== this.props.files.length
  }

  private onStashChanges = () => {
    const repository = this.props.repository
    if (repository === null) return
    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDiscardChanges,
      repository: repository,
      showDiscardChangesSetting: false,
      discardingAllChanges: true,
      files: this.props.files,
    })
  }

  public render() {
    return (
      <ToolbarButton
        title="Discard"
        icon={OcticonSymbol.remove}
        onClick={this.onStashChanges}
        disabled={this.props.files.length === 0}
        className="vertically warning"
      />
    )
  }
}

export const ToolbarDiscardButton = connect(mapStateToProps)(LocalToolbarDiscardButton)