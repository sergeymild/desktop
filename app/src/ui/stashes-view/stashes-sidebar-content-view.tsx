import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { getStashedFiles } from '../../lib/git/stash'
import { Repository } from '../../models/repository'
import { CommittedFileChange } from '../../models/status'
import { FileList } from '../history/file-list'
import { Resizable } from '../resizable'
import { Dispatcher } from '../dispatcher'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { IDiff, ImageDiffType } from '../../models/diff'
import { getCommitDiff } from '../../lib/git'
import { connect, IGlobalState } from '../index'

interface IProps {
  readonly repository: Repository
  readonly commitSummaryWidth: number
  readonly dispatcher: Dispatcher
  readonly selectedDiffType: ImageDiffType
  readonly hideWhitespaceInDiff: boolean
  readonly showSideBySideDiff: boolean
}

interface IExProps {
  readonly selectedStash: IStashEntry | null
}

interface IState {
  files: ReadonlyArray<CommittedFileChange>
  selectedFile: CommittedFileChange | null
  readonly currentDiff: IDiff | null
}

const mapStateToProps = (state: IGlobalState): IProps => {
  return {
    repository: state.appStore.selectedRepository as Repository,
    dispatcher: state.dispatcher,
    hideWhitespaceInDiff: state.appStore.hideWhitespaceInDiff,
    selectedDiffType: state.appStore.imageDiffType,
    commitSummaryWidth: state.appStore.commitSummaryWidth,
    showSideBySideDiff: state.appStore.showSideBySideDiff
  }
}

class LocalStashesSidebarContentView extends React.Component<IProps & IExProps, IState> {

  public constructor(props: IProps & IExProps) {
    super(props)

    this.state = {
      files: [],
      selectedFile: null,
      currentDiff: null
    }
  }

  public async componentWillReceiveProps(nextProps: Readonly<IProps & IExProps>, nextContext: any) {
    const stashSha = nextProps.selectedStash?.stashSha
    if (!stashSha) {
      return
    }
    const files = await getStashedFiles(this.props.repository, stashSha)
    this.setState({...this.state, files})
    if (files.length > 0) {
      await this.onSelectedFileChanged(files[0])
    }
  }

  private onSelectedFileChanged = async (file: CommittedFileChange) => {

    const diff = await getCommitDiff(
      this.props.repository,
      file,
      this.props.selectedStash!.stashSha,
      this.props.hideWhitespaceInDiff
    )
    this.setState({
      ...this.state,
      selectedFile: file,
      currentDiff: diff
    })
  }

  private onCommitSummaryReset = async () => {
    await this.props.dispatcher.resetCommitSummaryWidth()
  }

  private onCommitSummaryResize = async (width: number) => {
    await this.props.dispatcher.setCommitSummaryWidth(width)
  }

  private renderFileList = (): JSX.Element => {
    return <FileList
      availableWidth={this.props.commitSummaryWidth - 1}
      files={this.state.files}
      selectedFile={this.state.selectedFile}
      onSelectedFileChanged={this.onSelectedFileChanged}/>
  }

  private renderDiff() {
    const file = this.state.selectedFile
    const diff = this.state.currentDiff

    if (file == null) {
      // don't show both 'empty' messages
      const message =
        this.state.files.length === 0 ? '' : 'No file selected'

      return (
        <div className="panel blankslate" id="diff">
          {message}
        </div>
      )
    }

    return (
      <SeamlessDiffSwitcher
        repository={this.props.repository}
        imageDiffType={this.props.selectedDiffType}
        file={file}
        diff={diff}
        readOnly={true}
        showSideBySideDiff={this.props.showSideBySideDiff}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
      />
    )
  }

  public render(): JSX.Element {
    return (
      <div id="history" className="expanded">
        <div className="commit-details">
          <Resizable
            width={this.props.commitSummaryWidth}
            onResize={this.onCommitSummaryResize}
            onReset={this.onCommitSummaryReset}
          >
            {this.renderFileList()}
          </Resizable>
          {this.renderDiff()}
        </div>
      </div>
    )
  }
}

export const StashesSidebarContentView =
  connect<IProps, IState, IExProps>(mapStateToProps)(LocalStashesSidebarContentView)