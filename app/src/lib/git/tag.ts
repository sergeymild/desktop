import { git, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { IGitAccount } from '../../models/git-account'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'

export interface IRepositoryTags {
  readonly localTags: ReadonlyArray<ITagItem>
  readonly tagsToPush: ReadonlyArray<string>
}

interface ITagItem {
  name: string,
  subject: string | null,
  hash: string,
  date: string,
  remote: Boolean
}

export {ITagItem}

/**
 * Create a new tag on the given target commit.
 *
 * @param repository        - The repository in which to create the new tag.
 * @param name              - The name of the new tag.
 * @param message           - The message of the new tag.
 * @param targetCommitSha   - The SHA of the commit where the new tag will live on.
 */
export async function createTag(
  repository: Repository,
  name: string,
  message: string | null,
  targetCommitSha: string
): Promise<void> {
  const args = ['tag', '-a', '-m', message || "", name, targetCommitSha]

  await git(args, repository.path, 'createTag')
}

export async function deleteTag(
  repository: Repository,
  name: string,
  account: IGitAccount | null,
  remote: IRemote | null,
  isRemote: boolean
): Promise<void> {
  let args = ['tag', '-d', name]
  await git(args, repository.path, 'deleteLocalTag')

  let env: Object | undefined
  if (remote !== null && isRemote) {
    env = await envForRemoteOperation(account, remote.url)
    args = ['push', '--delete', remote.name, name]
    await git(args, repository.path, 'deleteLocalTag', {
      env
    })
  }
}

export async function checkoutToTag(
  repository: Repository,
  checkoutTo: string
): Promise<void> {
  await git(['checkout', checkoutTo], repository.path, 'checkoutToTag')
}

export async function fetchRemoteTags(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote | null
): Promise<Map<string, string>> {
  try {
    const args = ['ls-remote', '--tags']

    let env: Object | undefined
    if (remote !== null) {
      env = await envForRemoteOperation(account, remote.url)
    }
    const tags = await git(args, repository.path, 'fetchRemoteTags', {
      env: env,
      successExitCodes: new Set([0, 1]), // when there are no tags, git exits with 1.
    })

    const tagsArray: Array<[string, string]> = tags.stdout
      .split('\n')
      .filter(line => line !== '')
      .map(line => {
        const [commitSha, rawTagName] = line.split('\t')

        const tagName = rawTagName
          .replace(/^refs\/tags\//, '')
          .replace(/\^\{\}$/, '')

        return [tagName, commitSha]
      })

    return new Map(tagsArray)
  } catch (e) {
    return new Map<string, string>()
  }
}

export async function fetchAllTags(
  repository: Repository,
  remoteTags: Map<string, string>
) : Promise<ReadonlyArray<ITagItem>> {
  const args = ['for-each-ref', '--sort=creatordate', "--format='%(refname)|%(creatordate)|%(objectname)|%(subject)'", 'refs/tags']

  const tags = await git(args, repository.path, 'fetchAllTags', {
    successExitCodes: new Set([0, 1]), // when there are no tags, git exits with 1.
  })

  const tagsArray: Array<ITagItem> = tags.stdout
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      const [rawTagName, date, hash, subject] = line
        .replace("'", "")
        .replace("'", "")
        .split('|')

      const name = rawTagName
        .replace(/^refs\/tags\//, '')
        .replace(/\^\{\}$/, '')

      return {
        name,
        subject: subject.length === 0 ? "no comment" : subject,
        hash,
        date,
        remote: remoteTags.get(name) != null
      }
    })
  return tagsArray.reverse()
}

/**
 * Fetches the tags that will get pushed to the remote repository (it does a network request).
 *
 * @param repository  - The repository in which to check for unpushed tags
 * @param account     - The account to use when authenticating with the remote
 * @param remote      - The remote to check for unpushed tags
 * @param branchName  - The branch that will be used on the push command
 */
export async function fetchTagsToPush(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote,
  branchName: string
): Promise<ReadonlyArray<string>> {
  const networkArguments = await gitNetworkArguments(repository, account)

  const args = [
    ...networkArguments,
    'push',
    remote.name,
    branchName,
    '--follow-tags',
    '--dry-run',
    '--no-verify',
    '--porcelain',
  ]

  const result = await git(args, repository.path, 'fetchTagsToPush', {
    env: await envForRemoteOperation(account, remote.url),
    successExitCodes: new Set([0, 1, 128]),
  })

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    // Only when the exit code of git is 0 or 1, its stdout is parseable.
    // In other cases, we just rethrow the error so our memoization layer
    // doesn't cache it indefinitely.
    throw result.gitError
  }

  const lines = result.stdout.split('\n')
  let currentLine = 1
  const unpushedTags = []

  // the last line of this porcelain command is always 'Done'
  while (currentLine < lines.length && lines[currentLine] !== 'Done') {
    const line = lines[currentLine]
    const parts = line.split('\t')

    if (parts[0] === '*' && parts[2] === '[new tag]') {
      const [tagName] = parts[1].split(':')

      if (tagName !== undefined) {
        unpushedTags.push(tagName.replace(/^refs\/tags\//, ''))
      }
    }

    currentLine++
  }

  return unpushedTags
}
