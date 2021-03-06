import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'

import { Repository } from '../../models/repository'
import {
  RebaseStep,
  RebaseFlowStep,
  ShowConflictsStep,
  ConfirmAbortStep,
} from '../../models/rebase-flow-step'
import { GitRebaseProgress } from '../../models/rebase'
import { WorkingDirectoryStatus } from '../../models/status'

import { Dispatcher } from '../dispatcher'

import { ChooseBranchDialog } from './choose-branch'
import { ShowConflictedFilesDialog } from './show-conflicted-files-dialog'
import { RebaseProgressDialog } from './progress-dialog'
import { ConfirmAbortDialog } from './confirm-abort-dialog'
import { getResolvedFiles } from '../../lib/status'
import { WarnForcePushDialog } from './warn-force-push-dialog'
import { dispatcher } from '../index'

interface IRebaseFlowProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** The current state of the working directory */
  readonly workingDirectory: WorkingDirectoryStatus

  /**
   * The current step in the rebase flow, containing application-specific
   * state needed for the UI components.
   */
  readonly step: RebaseFlowStep

  /** Git progress information about the current rebase */
  readonly progress: GitRebaseProgress | null

  /**
   * Track whether the user has done work to resolve conflicts as part of this
   * rebase, as the component should confirm with the user that they wish to
   * abort the rebase and lose that work.
   */
  readonly userHasResolvedConflicts: boolean

  readonly askForConfirmationOnForcePush: boolean

  readonly resolvedExternalEditor: string | null
  readonly onDismissed: () => void
}

/** A component for initiating and performing a rebase of the current branch. */
export class RebaseFlow extends React.Component<IRebaseFlowProps> {
  private moveToShowConflictedFileState = (step: ConfirmAbortStep) => {
    const { conflictState } = step
    this.props.dispatcher.setRebaseFlowStep(this.props.repository, {
      kind: RebaseStep.ShowConflicts,
      conflictState,
    })
  }

  private onContinueRebase = async (step: ShowConflictsStep) => {
    const { conflictState } = step

    const continueRebaseAction = () => {
      return this.props.dispatcher.continueRebase(
        this.props.repository,
        this.props.workingDirectory,
        conflictState
      )
    }

    this.props.dispatcher.setRebaseFlowStep(this.props.repository, {
      kind: RebaseStep.ShowProgress,
      rebaseAction: continueRebaseAction,
    })
  }

  private showRebaseConflictsBanner = (step: ShowConflictsStep) => {
    this.props.dispatcher.setRebaseFlowStep(this.props.repository, {
      kind: RebaseStep.HideConflicts,
    })

    const { targetBranch } = step.conflictState
    dispatcher.onShowRebaseConflictsBanner(this.props.repository, targetBranch)
  }

  private onConfirmAbortRebase = (step: ShowConflictsStep) => {
    const { workingDirectory, userHasResolvedConflicts } = this.props
    const { conflictState } = step
    const { manualResolutions } = conflictState

    if (userHasResolvedConflicts) {
      // a previous commit was resolved by the user
      this.props.dispatcher.setRebaseFlowStep(this.props.repository, {
        kind: RebaseStep.ConfirmAbort,
        conflictState,
      })
      return
    }

    // otherwise check the current commit for resolved changes
    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (resolvedConflicts.length > 0) {
      this.props.dispatcher.setRebaseFlowStep(this.props.repository, {
        kind: RebaseStep.ConfirmAbort,
        conflictState,
      })
    } else {
      this.onAbortRebase()
    }
  }

  private onAbortRebase = async () => {
    await this.props.dispatcher.abortRebase(this.props.repository)
    this.onFlowEnded()
  }

  private onFlowEnded = () => {
    this.props.onDismissed()
    dispatcher.endRebaseFlow(this.props.repository)
  }

  public render() {
    const { step } = this.props

    switch (step.kind) {
      case RebaseStep.ChooseBranch: {
        const { repository, dispatcher } = this.props
        const {
          allBranches,
          defaultBranch,
          currentBranch,
          recentBranches,
          initialBranch,
        } = step
        return (
          <ChooseBranchDialog
            key="choose-branch"
            repository={repository}
            dispatcher={dispatcher}
            allBranches={allBranches}
            defaultBranch={defaultBranch}
            recentBranches={recentBranches}
            currentBranch={currentBranch}
            initialBranch={initialBranch}
            onDismissed={this.onFlowEnded}
          />
        )
      }
      case RebaseStep.ShowProgress:
        const { progress } = this.props

        if (progress === null) {
          log.error(
            '[RebaseFlow] progress is null despite trying to show the progress view. Skipping rendering...'
          )
          return null
        }

        return <RebaseProgressDialog progress={progress} />
      case RebaseStep.ShowConflicts: {
        const {
          repository,
          resolvedExternalEditor,
          dispatcher,
          workingDirectory,
          userHasResolvedConflicts,
        } = this.props

        return (
          <ShowConflictedFilesDialog
            key="view-conflicts"
            repository={repository}
            dispatcher={dispatcher}
            step={step}
            showRebaseConflictsBanner={this.showRebaseConflictsBanner}
            workingDirectory={workingDirectory}
            userHasResolvedConflicts={userHasResolvedConflicts}
            resolvedExternalEditor={resolvedExternalEditor}
            onAbortRebase={this.onConfirmAbortRebase}
            onDismissed={this.onFlowEnded}
            onContinueRebase={this.onContinueRebase}
          />
        )
      }

      case RebaseStep.ConfirmAbort:
        return (
          <ConfirmAbortDialog
            step={step}
            onConfirmAbort={this.onAbortRebase}
            onReturnToConflicts={this.moveToShowConflictedFileState}
          />
        )
      case RebaseStep.WarnForcePush:
        const {
          repository,
          dispatcher,
          askForConfirmationOnForcePush,
        } = this.props

        return (
          <WarnForcePushDialog
            step={step}
            dispatcher={dispatcher}
            repository={repository}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            onDismissed={this.onFlowEnded}
          />
        )

      case RebaseStep.HideConflicts:
      case RebaseStep.Completed:
        // there is no UI to display at this point in the flow
        return null
      default:
        return assertNever(step, 'Unknown rebase step found')
    }
  }
}
