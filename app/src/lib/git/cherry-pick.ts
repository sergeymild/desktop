import { git } from './core'
import { GitError } from 'dugite'
import { Repository } from '../../models/repository'

export enum CherryPickResult {
  /** The cherry pick completed successfully */
  Success,
  /**
   * The cherry pick was a noop since the current branch
   * was already up to date with the target branch.
   */
  AlreadyUpToDate,
  /**
   * The merge failed, likely due to conflicts.
   */
  Failed,
}

/** Merge the named branch into the current branch. */
export async function cherryPick(
  repository: Repository,
  commitSha: string,
  branch: string
): Promise<CherryPickResult> {
  const { exitCode, stdout } = await git(
    ['cherry-pick', commitSha],
    repository.path,
    'cherry-pick',
    {
      expectedErrors: new Set([GitError.MergeConflicts]),
    }
  )

  console.log("--> CHERRY-PICK STDOUT")
  console.log("---------", stdout)
  console.log("exit code", exitCode)
  console.log("<-- CHERRY-PICK STDOUT")

  if (exitCode !== 0) {
    return CherryPickResult.Failed
  }

  return CherryPickResult.Success
}
