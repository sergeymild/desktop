import * as React from 'react'
import classNames from 'classnames'

import { Repository } from '../../models/repository'

import { Diff } from './index'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import {
  DiffSelection,
  IDiff,
  ImageDiffType,
  ITextDiff,
} from '../../models/diff'
import { Loading } from '../lib/loading'
import { dispatcher } from '../index'
import { openFile } from '../lib/open-file'

/**
 * The time (in milliseconds) we allow when loading a diff before
 * treating the diff load as slow.
 */
const SlowDiffLoadingThreshold = 150

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

interface ISeamlessDiffSwitcherProps {
  readonly repository: Repository

  /**
   * Whether the diff is readonly, e.g., displaying a historical diff, or the
   * diff's lines can be selected, e.g., displaying a change in the working
   * directory.
   */
  readonly readOnly: boolean

  /** The file whose diff should be displayed. */
  readonly file: ChangedFile

  /** Called when the includedness of lines or a range of lines has changed. */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /** The diff that should be rendered */
  readonly diff: IDiff | null

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType

  /** Hiding whitespace in diff. */
  readonly hideWhitespaceInDiff: boolean

  /** Whether we should show a confirmation dialog when the user discards changes */
  readonly askForConfirmationOnDiscardChanges?: boolean

  /*
   * Called when the user wants to discard a selection of the diff.
   * Only applicable when readOnly is false.
   */
  readonly onDiscardChanges?: (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => void
}

interface ISeamlessDiffSwitcherState {
  /**
   * Whether or not the application is currently loading the next
   * diff that should be displayed.
   */
  readonly isLoadingDiff: boolean

  /**
   * Whether or not the application has taken more than
   * `SlowDiffLoadingThreshold` milliseconds trying to load the
   * diff
   */
  readonly isLoadingSlow: boolean

  /**
   * The current props for the SeamlessDiffSwitcher or a snapshot
   * of props from the last time we had a Diff to show if the
   * `isLoadingDiff` prop is true.
   */
  readonly propSnapshot: ISeamlessDiffSwitcherProps
}

/** I'm super useful */
function noop() {}

/**
 * A component which attempts to minimize the need for unmounting
 * and remounting text diff components with the ultimate goal of
 * avoiding flickering when rapidly switching between files.
 */
export class SeamlessDiffSwitcher extends React.Component<
  ISeamlessDiffSwitcherProps,
  ISeamlessDiffSwitcherState
> {
  public static getDerivedStateFromProps(
    props: ISeamlessDiffSwitcherProps,
    state: ISeamlessDiffSwitcherState
  ): Partial<ISeamlessDiffSwitcherState> {
    const isLoadingDiff = props.diff === null
    const beganOrFinishedLoadingDiff = isLoadingDiff !== state.isLoadingDiff

    return {
      isLoadingDiff,
      ...(!isLoadingDiff ? { propSnapshot: props } : undefined),
      // If we've just begun loading the diff or just finished loading it we
      // can't say that it's slow in all other cases we leave the
      // isLoadingSlow state as-is
      ...(beganOrFinishedLoadingDiff ? { isLoadingSlow: false } : undefined),
    }
  }

  private slowLoadingTimeoutId: number | null = null

  public constructor(props: ISeamlessDiffSwitcherProps) {
    super(props)

    this.state = {
      isLoadingDiff: props.diff === null,
      isLoadingSlow: false,
      propSnapshot: props,
    }
  }

  public componentDidMount() {
    if (this.state.isLoadingDiff) {
      this.scheduleSlowLoadingTimeout()
    }
  }

  public componentWillUnmount() {
    this.clearSlowLoadingTimeout()
  }

  public componentDidUpdate(
    prevProps: ISeamlessDiffSwitcherProps,
    prevState: ISeamlessDiffSwitcherState
  ) {
    // Have we transitioned from loading to not loading or vice versa?
    if (this.state.isLoadingDiff !== prevState.isLoadingDiff) {
      if (this.state.isLoadingDiff) {
        // If we've just begun loading the diff, start the timer
        this.scheduleSlowLoadingTimeout()
      } else {
        // If we're no longer loading the diff make sure that we're not
        // still counting down
        this.clearSlowLoadingTimeout()
      }
    }
  }

  private onSlowLoadingTimeout = () => {
    this.setState({ isLoadingSlow: true })
  }

  private scheduleSlowLoadingTimeout() {
    this.clearSlowLoadingTimeout()
    this.slowLoadingTimeoutId = window.setTimeout(
      this.onSlowLoadingTimeout,
      SlowDiffLoadingThreshold
    )
  }

  private clearSlowLoadingTimeout() {
    if (this.slowLoadingTimeoutId !== null) {
      window.clearTimeout(this.slowLoadingTimeoutId)
      this.slowLoadingTimeoutId = null
    }
  }

  private onChangeImageDiffType = async (imageDiffType: ImageDiffType) => {
    await dispatcher.changeImageDiffType(imageDiffType)
  }

  private onOpenBinaryFile = async (fullPath: string) => {
    await openFile(fullPath, dispatcher)
  }

  public render() {
    const { isLoadingDiff, isLoadingSlow } = this.state
    const {
      repository,
      imageDiffType,
      readOnly,
      hideWhitespaceInDiff,
      onIncludeChanged,
      onDiscardChanges,
      diff,
      file,
    } = this.state.propSnapshot

    const className = classNames('seamless-diff-switcher', {
      loading: isLoadingDiff,
      slow: isLoadingDiff && isLoadingSlow,
      'has-diff': diff !== null,
    })

    const loadingIndicator = isLoadingDiff ? (
      <div className="loading-indicator">
        <Loading />
      </div>
    ) : null

    return (
      <div className={className}>
        {diff !== null ? (
          <Diff
            repository={repository}
            imageDiffType={imageDiffType}
            file={file}
            diff={diff}
            readOnly={readOnly}
            hideWhitespaceInDiff={hideWhitespaceInDiff}
            askForConfirmationOnDiscardChanges={
              this.props.askForConfirmationOnDiscardChanges
            }
            onIncludeChanged={isLoadingDiff ? noop : onIncludeChanged}
            onDiscardChanges={isLoadingDiff ? noop : onDiscardChanges}
            onOpenBinaryFile={isLoadingDiff ? noop : this.onOpenBinaryFile}
            onChangeImageDiffType={isLoadingDiff ? noop : this.onChangeImageDiffType}
          />
        ) : null}
        {loadingIndicator}
      </div>
    )
  }
}
