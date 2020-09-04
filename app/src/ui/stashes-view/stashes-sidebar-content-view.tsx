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

interface IStashesSidebarContentProps {
  readonly repository: Repository
  readonly selectedStash: IStashEntry | null
  readonly commitSummaryWidth: number
  readonly dispatcher: Dispatcher
  readonly selectedDiffType: ImageDiffType
  readonly hideWhitespaceInDiff: boolean
  readonly onOpenBinaryFile: (fullPath: string) => void
  readonly onChangeImageDiffType: (type: ImageDiffType) => void
}

interface IStashesSidebarContentState {
  files: ReadonlyArray<CommittedFileChange>
  selectedFile: CommittedFileChange | null
  readonly currentDiff: IDiff | null
}

export class StashesSidebarContentView extends React.Component<IStashesSidebarContentProps, IStashesSidebarContentState> {

  public constructor(props: IStashesSidebarContentProps) {
    super(props)

    this.state = {
      files: [],
      selectedFile: null,
      currentDiff: null
    }
  }

  public async componentWillReceiveProps(nextProps: Readonly<IStashesSidebarContentProps>, nextContext: any) {
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
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        onOpenBinaryFile={this.props.onOpenBinaryFile}
        onChangeImageDiffType={this.props.onChangeImageDiffType}
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