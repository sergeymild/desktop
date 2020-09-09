import { setupEmptyRepository } from './repositories'
import { makeCommit, switchTo } from './repository-scaffolding'
import { GitProcess } from 'dugite'
import { RepositoriesStore, GitStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { Repository } from '../../src/models/repository'
import { IAPIRepository } from '../../src/lib/api'
import { shell } from './test-app-shell'

export async function createRepository() {
  const repo = await setupEmptyRepository()

  const firstCommit = {
    entries: [
      { path: 'foo', contents: '' },
      { path: 'perlin', contents: 'perlin' },
    ],
  }

  await makeCommit(repo, firstCommit)

  // creating the new branch before switching so that we have distinct changes
  // on both branches and also to ensure a merge commit is needed
  await GitProcess.exec(['branch', 'other-branch'], repo.path)

  const secondCommit = {
    entries: [{ path: 'foo', contents: 'b1' }],
  }

  await makeCommit(repo, secondCommit)

  await switchTo(repo, 'other-branch')

  const thirdCommit = {
    entries: [{ path: 'bar', contents: 'b2' }],
  }
  await makeCommit(repo, thirdCommit)

  const fourthCommit = {
    entries: [{ path: 'baz', contents: 'very much more words' }],
  }
  await makeCommit(repo, fourthCommit)

  await switchTo(repo, 'master')

  // ensure the merge operation always creates a merge commit
  await GitProcess.exec(['merge', 'other-branch', '--no-ff'], repo.path)

  // clear reflog of all entries, so any branches are considered candidates for pruning
  await GitProcess.exec(
    ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all'],
    repo.path
  )

  return repo.path
}

export async function setupRepository(
  path: string,
  repositoriesStore: RepositoriesStore,
  repositoriesStateCache: RepositoryStateCache,
  includesGhRepo: boolean,
  defaultBranchName: string,
  lastPruneDate?: Date
) {
  let repository = await repositoriesStore.addRepository(path)
  if (includesGhRepo) {
    const ghAPIResult: IAPIRepository = {
      clone_url: 'string',
      ssh_url: 'string',
      html_url: 'string',
      name: 'string',
      owner: {
        id: 0,
        url: '',
        login: '',
        avatar_url: '',
        type: 'User',
      },
      private: false,
      fork: false,
      default_branch: defaultBranchName,
      pushed_at: 'string',
      has_issues: true,
      archived: false,
      permissions: {
        pull: true,
        push: true,
        admin: false,
      },
    }

    repository = await repositoriesStore.updateGitHubRepository(
      repository,
      '',
      ghAPIResult
    )
  }
  await primeCaches(repository, repositoriesStateCache)

  if (lastPruneDate) {
    repositoriesStore.updateLastPruneDate(repository, lastPruneDate.getTime())
  }

  return repository
}

/**
 * Setup state correctly without having to expose
 * the internals of the GitStore and caches
 */
async function primeCaches(
  repository: Repository,
  repositoriesStateCache: RepositoryStateCache
) {
  const gitStore = new GitStore(
    repository,
    shell,
  )

  // rather than re-create the branches and stuff as objects, these calls
  // will run the underlying Git operations and update the GitStore state
  await gitStore.loadRemotes()
  await gitStore.loadBranches()
  await gitStore.loadStatus()

  // once that is done, we can populate the repository state in the same way
  // that AppStore does for the sake of this test
  repositoriesStateCache.updateBranchesState(repository, () => ({
    tip: gitStore.tip,
    defaultBranch: gitStore.defaultBranch,
    allBranches: gitStore.allBranches,
    recentBranches: gitStore.recentBranches,
  }))
}
