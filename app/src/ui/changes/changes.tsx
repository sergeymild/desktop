import * as React from 'react'
import { ChangedFileDetails } from './changed-file-details'
import { DiffSelection, DiffType, IDiff, ImageDiffType, ITextDiff } from '../../models/diff'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { PopupType } from '../../models/popup'
import { connect, dispatcher, IGlobalState } from '../index'
import { Dispatcher } from '../dispatcher'

interface IProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly imageDiffType: ImageDiffType

  /** Whether a commit is in progress */
  readonly isCommitting: boolean
  readonly hideWhitespaceInDiff: boolean
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly unified: number
}

interface IExProps {
  readonly file: WorkingDirectoryFileChange
  readonly diff: IDiff | null
}

const mapStateToProps = (state: IGlobalState): IProps => {

  return {
    hideWhitespaceInDiff: state.appStore.hideWhitespaceInDiff,
    dispatcher: state.dispatcher,
    repository: state.appStore.selectedRepository as Repository,
    isCommitting: state.appStore.possibleSelectedState?.state?.isCommitting || false,
    askForConfirmationOnDiscardChanges: state.appStore.confirmDiscardChanges,
    imageDiffType: state.appStore.imageDiffType,
    unified: state.appStore.unified
  }
}

class LocalChanges extends React.Component<IProps & IExProps, {}> {

  private onDiffLineIncludeChanged = (diffSelection: DiffSelection) => {
    const file = this.props.file
    dispatcher.changeFileLineSelection(
      this.props.repository,
      file.id,
      diffSelection
    )
  }

  private onDiscardChanges = (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => {
    if (this.props.askForConfirmationOnDiscardChanges) {
      dispatcher.showPopup({
        type: PopupType.ConfirmDiscardSelection,
        repository: this.props.repository,
        file: this.props.file,
        diff,
        selection: diffSelection,
      })
    } else {
      dispatcher.discardChangesFromSelection(
        this.props.repository,
        this.props.file.path,
        diff,
        diffSelection,
      )
    }
  }

  public render() {
    const diff = this.props.diff
    const file = this.props.file
    const isCommitting = this.props.isCommitting
    return (
      <div className="changed-file">
        <ChangedFileDetails
          path={file.path}
          status={file.status}
          diffKing={diff?.kind}
          lineEndingsChange={(diff?.kind === DiffType.Text) ? diff.lineEndingsChange : undefined}
          unified={this.props.unified}/>
        <SeamlessDiffSwitcher
          repository={this.props.repository}
          imageDiffType={this.props.imageDiffType}
          file={file}
          readOnly={isCommitting}
          onIncludeChanged={this.onDiffLineIncludeChanged}
          onDiscardChanges={this.onDiscardChanges}
          diff={diff}
          hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
          askForConfirmationOnDiscardChanges={
            this.props.askForConfirmationOnDiscardChanges
          }
        />
      </div>
    )
  }
}

export const Changes = connect<IProps, {}, IExProps>(mapStateToProps)(LocalChanges)