import { GitError as DugiteError } from 'dugite'
import { git, GitError } from './core'
import { Repository } from '../../models/repository'
import {
  IStashEntry,
  StashedChangesLoadStates,
  StashedFileChanges,
} from '../../models/stash-entry'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import { parseChangedFiles } from './log'
import { stageFiles } from './update-index'

/**
 * RegEx for determining if a stash entry is created by Desktop
 */
const desktopStashEntryMessageRe = /:(.+)$/

type StashResult = {
  /** The stash entries created by Desktop */
  readonly desktopEntries: ReadonlyArray<IStashEntry>

  /**
   * The total amount of stash entries,
   * i.e. stash entries created both by Desktop and outside of Desktop
   */
  readonly stashEntryCount: number
}

/**
 * Removes the given stash entry if it exists
 *
 * @param repository current working repository
 * @param stashName the Name that identifies the stash entry
 */
export async function removeStashEntry(
  repository: Repository,
  stashName: string
) {
  const args = ['stash', 'drop', stashName]
  await git(args, repository.path, 'removeStashEntry')
}

export async function fetchStashes(
  repository: Repository,
): Promise<StashResult> {
  const delimiter = '1F'
  const delimiterString = String.fromCharCode(parseInt(delimiter, 16))
  const format = ['%gD', '%H', '%gs', '%ct'].join(`%x${delimiter}`)

  const result = await git(
    ['log', '-g', '-z', `--pretty=${format}`, 'refs/stash'],
    repository.path,
    'getStashEntries',
    {
      successExitCodes: new Set([0, 128]),
    }
  )

  // There's no refs/stashes reflog in the repository or it's not
  // even a repository. In either case we don't care
  if (result.exitCode === 128) {
    return { desktopEntries: [], stashEntryCount: 0 }
  }

  const desktopStashEntries: Array<IStashEntry> = []
  const files: StashedFileChanges = {
    kind: StashedChangesLoadStates.NotLoaded,
  }

  const entries = result.stdout.split('\0').filter(s => s !== '')
  for (const entry of entries) {
    const pieces = entry.split(delimiterString)

    if (pieces.length > 3) {
      const [name, stashSha, uiName, createdAt] = pieces

      desktopStashEntries.push({
        name,
        uiName: uiName.replace("WIP on ", ""),
        branchName: extractBranchFromMessage(uiName),
        stashSha,
        files,
        createdAt: parseInt(createdAt, 10)
      })
    }
  }

  return {
    desktopEntries: desktopStashEntries,
    stashEntryCount: entries.length - 1,
  }
}

/**
 * Get the list of stash entries created by Desktop in the current repository
 * using the default ordering of refs (which is LIFO ordering),
 * as well as the total amount of stash entries.
 */
export async function getStashesCount(repository: Repository): Promise<number> {
  const result = await git(
    ['log', '-g', '-z', `--pretty=['%gD']`, 'refs/stash'],
    repository.path,
    'getStashEntries',
    {
      successExitCodes: new Set([0, 128]),
    }
  )
  if (result.exitCode === 128) {
    return 0
  }
  return result.stdout.split('\0').filter(s => s !== '').length
}

export async function getStashes(repository: Repository): Promise<StashResult> {
  const delimiter = '1F'
  const delimiterString = String.fromCharCode(parseInt(delimiter, 16))
  const format = ['%gD', '%H', '%gs', '%ct'].join(`%x${delimiter}`)

  const result = await git(
    ['log', '-g', '-z', `--pretty=${format}`, 'refs/stash'],
    repository.path,
    'getStashEntries',
    {
      successExitCodes: new Set([0, 128]),
    }
  )

  // There's no refs/stashes reflog in the repository or it's not
  // even a repository. In either case we don't care
  if (result.exitCode === 128) {
    return { desktopEntries: [], stashEntryCount: 0 }
  }

  const desktopStashEntries: Array<IStashEntry> = []
  const files: StashedFileChanges = {
    kind: StashedChangesLoadStates.NotLoaded,
  }

  const entries = result.stdout.split('\0').filter(s => s !== '')
  for (const entry of entries) {
    const pieces = entry.split(delimiterString)

    if (pieces.length > 3) {
      const [name, stashSha, message, createdAt] = pieces
      const branchName = extractBranchFromMessage(message)

      if (branchName !== null) {
        desktopStashEntries.push({
          name,
          branchName,
          stashSha,
          files,
          uiName: message.replace("WIP on", ""),
          createdAt: parseInt(createdAt, 10)
        })
      }
    }
  }

  return {
    desktopEntries: desktopStashEntries,
    stashEntryCount: entries.length - 1,
  }
}

/**
 * Returns the last Desktop created stash entry for the given branch
 */
export async function getLastDesktopStashEntryForBranch(repository: Repository) {
  const stash = await fetchStashes(repository)
  const firstStash = stash.desktopEntries.length > 0 ? stash.desktopEntries[0] : null
  return firstStash
}

/**
 * Stash the working directory changes for the current branch
 */
export async function createDesktopStashEntry(
  repository: Repository,
  branchName: string | null,
  untrackedFilesToStage: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<true> {
  // We must ensure that no untracked files are present before stashing
  // See https://github.com/desktop/desktop/pull/8085
  // First ensure that all changes in file are selected
  // (in case the user has not explicitly checked the checkboxes for the untracked files)
  const fullySelectedUntrackedFiles = untrackedFilesToStage.map(x =>
    x.withIncludeAll(true)
  )
  await stageFiles(repository, fullySelectedUntrackedFiles)

  const args = ['stash', 'push', '-m', branchName ?? "(no)"]

  const result = await git(args, repository.path, 'createStashEntry', {
    successExitCodes: new Set<number>([0, 1]),
  })

  if (result.exitCode === 1) {
    // search for any line starting with `error:` -  /m here to ensure this is
    // applied to each line, without needing to split the text
    const errorPrefixRe = /^error: /m

    const matches = errorPrefixRe.exec(result.stderr)
    if (matches !== null && matches.length > 0) {
      // rethrow, because these messages should prevent the stash from being created
      throw new GitError(result, args)
    } else {
      log.info(
        `[createDesktopStashEntry] a stash was created successfully but exit code ${result.exitCode} reported. stderr: ${result.stderr}`
      )
      throw new Error(result.stdout)
    }
  }

  return true
}

async function getStashEntryMatchingSha(repository: Repository, sha: string) {
  const stash = await getStashes(repository)
  return stash.desktopEntries.find(e => e.stashSha === sha) || null
}

/**
 * Removes the given stash entry if it exists
 *
 * @param repository current working repository
 * @param stashSha the SHA that identifies the stash entry
 */
export async function dropDesktopStashEntry(
  repository: Repository,
  stashSha: string
) {
  const entryToDelete = await getStashEntryMatchingSha(repository, stashSha)

  if (entryToDelete !== null) {
    const args = ['stash', 'drop', entryToDelete.name]
    await git(args, repository.path, 'dropStashEntry')
  }
}

/**
 * Pops the stash entry identified by matching `stashSha` to its commit hash.
 *
 * To see the commit hash of stash entry, run
 * `git log -g refs/stash --pretty="%nentry: %gd%nsubject: %gs%nhash: %H%n"`
 * in a repo with some stash entries.
 */
export async function popStashEntry(
  repository: Repository,
  stashName: string
): Promise<void> {
  // ignoring these git errors for now, this will change when we start
  // implementing the stash conflict flow
  const expectedErrors = new Set<DugiteError>([DugiteError.MergeConflicts])
  const successExitCodes = new Set<number>([0, 1])

  const args = ['stash', 'pop', '--quiet', `${stashName}`]
  const result = await git(args, repository.path, 'popStashEntry', {
    expectedErrors,
    successExitCodes,
  })

  // popping a stashes that create conflicts in the working directory
  // report an exit code of `1` and are not dropped after being applied.
  // so, we check for this case and drop them manually
  if (result.exitCode === 1) {
    if (result.stderr.length > 0) {
      // rethrow, because anything in stderr should prevent the stash from being popped
      throw new GitError(result, args)
    }

    log.info(
      `[popStashEntry] a stash was popped successfully but exit code ${result.exitCode} reported.`
    )
  }
}

/**
 * Pops the stash entry identified by matching `stashSha` to its commit hash.
 *
 * To see the commit hash of stash entry, run
 * `git log -g refs/stash --pretty="%nentry: %gd%nsubject: %gs%nhash: %H%n"`
 * in a repo with some stash entries.
 */
export async function applyStashEntry(
  repository: Repository,
  stashName: string
): Promise<void> {
  // ignoring these git errors for now, this will change when we start
  // implementing the stash conflict flow
  const expectedErrors = new Set<DugiteError>([DugiteError.MergeConflicts])
  const successExitCodes = new Set<number>([0, 1])

  const args = ['stash', 'apply', '--quiet', `${stashName}`]
  const result = await git(args, repository.path, 'applyStashEntry', {
    expectedErrors,
    successExitCodes,
  })

  // popping a stashes that create conflicts in the working directory
  // report an exit code of `1` and are not dropped after being applied.
  // so, we check for this case and drop them manually
  if (result.exitCode === 1) {
    if (result.stderr.length > 0) {
      // rethrow, because anything in stderr should prevent the stash from being popped
      throw new GitError(result, args)
    }

    log.info(
      `[applyStashEntry] a stash was applied successfully but exit code ${result.exitCode} reported.`
    )
  }
}

function extractBranchFromMessage(message: string): string {
  const match = desktopStashEntryMessageRe.exec(message
    .replace(/^(WIP\son\s?)/, "")
    .replace(/^(([oO])n\s?)/, ""))
  const name = match === null || match[1].length === 0 ? null : match[1]
  return name?.trim() || "unknown"
}

/**
 * Get the files that were changed in the given stash commit.
 *
 * This is different than `getChangedFiles` because stashes
 * have _3 parents(!!!)_
 */
export async function getStashedFiles(
  repository: Repository,
  stashSha: string
): Promise<ReadonlyArray<CommittedFileChange>> {
  const [trackedFiles, untrackedFiles] = await Promise.all([
    getChangedFilesWithinStash(repository, stashSha),
    getChangedFilesWithinStash(repository, `${stashSha}^3`),
  ])

  const files = new Map<string, CommittedFileChange>()
  trackedFiles.forEach(x => files.set(x.path, x))
  untrackedFiles.forEach(x => files.set(x.path, x))
  return [...files.values()].sort((x, y) => x.path.localeCompare(y.path))
}

/**
 * Same thing as `getChangedFiles` but with extra handling for 128 exit code
 * (which happens if the commit's parent is not valid)
 *
 * **TODO:** merge this with `getChangedFiles` in `log.ts`
 */
async function getChangedFilesWithinStash(repository: Repository, sha: string) {
  // opt-in for rename detection (-M) and copies detection (-C)
  // this is equivalent to the user configuring 'diff.renames' to 'copies'
  // NOTE: order here matters - doing -M before -C means copies aren't detected
  const args = [
    'log',
    sha,
    '-C',
    '-M',
    '-m',
    '-1',
    '--no-show-signature',
    '--first-parent',
    '--name-status',
    '--format=format:',
    '-z',
    '--',
  ]
  const result = await git(args, repository.path, 'getChangedFilesForStash', {
    // if this fails, its most likely
    // because there weren't any untracked files,
    // and that's okay!
    successExitCodes: new Set([0, 128]),
  })
  if (result.exitCode === 0 && result.stdout.length > 0) {
    return parseChangedFiles(result.stdout, sha)
  }
  return []
}
