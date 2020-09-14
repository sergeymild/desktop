import * as React from 'react'
import { useCallback, useEffect } from 'react'
import { ipcRenderer } from "electron"
import { MenuEvent } from '../main-process/menu'
import { PopupType } from '../models/popup'
import { dispatcher } from './index'
import { assertNever } from '../lib/fatal-error'

interface IProps {
  readonly isHasError: boolean
}

export const MenuEventHandlerView: React.FC<IProps> = ({isHasError}) => {
  const onMenuEvent = useCallback(async (name: MenuEvent) => {
    log.info(`onMenuEvent: '${name}'`)
    if (isHasError) return
    switch (name) {
      case 'push':
        return dispatcher.push()
      case 'force-push':
        return dispatcher.push({ forceWithLease: true })
      case 'pull':
        return dispatcher.pull()
      case 'show-changes':
        return dispatcher.showChanges()
      case 'show-stashes':
        return dispatcher.showStashes()
      case 'show-history':
        return dispatcher.showHistory()
      case 'choose-repository':
        return dispatcher.chooseRepository()
      case 'add-local-repository':
        return dispatcher.showPopup({ type: PopupType.AddRepository })
      case 'create-branch':
        return dispatcher.showCreateBranch()
      case 'show-branches':
        return dispatcher.showBranches()
      case 'show-tags':
        return dispatcher.showTags()
      case 'remove-repository':
        return dispatcher.removeCurrentRepository()
      case 'create-repository':
        return dispatcher.showPopup({ type: PopupType.CreateRepository })
      case 'rename-branch':
        return dispatcher.renameDialogBranch()
      case 'delete-branch':
        return dispatcher.deleteDialogBranch()
      case 'discard-all-changes':
        return dispatcher.discardAllChanges()
      case 'show-preferences':
        return dispatcher.showPopup({ type: PopupType.Preferences })
      case 'open-working-directory':
        return dispatcher.openCurrentRepositoryWorkingDirectory()
      case 'update-branch':
        return dispatcher.updateBranch()
      case 'commit-changes':
        return dispatcher.commitMessageDialog()
      case 'merge-branch':
        return dispatcher.mergeBranchDialog()
      case 'rebase-branch':
        return dispatcher.showRebaseDialog()
      case 'show-repository-settings':
        return dispatcher.showRepositorySettings()
      case 'view-repository-on-github':
        return dispatcher.viewRepositoryOnGitHub()
      case 'create-issue-in-repository-on-github':
        return dispatcher.openIssueCreationOnGitHub()
      case 'open-in-shell':
        return dispatcher.openCurrentRepositoryInShell()
      case 'clone-repository':
        return dispatcher.showCloneRepo()
      case 'show-about':
        return dispatcher.showPopup({ type: PopupType.About })
      case 'boomtown':
        return setImmediate(() => {
          throw new Error('Boomtown!')
        })
      case 'go-to-commit-message':
        await dispatcher.showChanges()
        return dispatcher.setCommitMessageFocus(true)
      case 'open-pull-request':
        return dispatcher.openPullRequest()
      case 'install-cli':
        return dispatcher.installCLI()
      case 'open-external-editor':
        return dispatcher.openCurrentRepositoryInExternalEditor()
      case 'select-all':
        return dispatcher.selectAll()
      case 'show-release-notes-popup': return
      case 'test-prune-branches': return
      case 'find-text':
        return dispatcher.findText()
      default:
        return assertNever(name, `Unknown menu event name: ${name}`)
    }

  }, [])

  useEffect(() => {
    ipcRenderer.on(
      'menu-event',
      (event: Electron.IpcRendererEvent, { name }: { name: MenuEvent }) => {
        onMenuEvent(name)
      }
    )
  }, [])

  return (<></>)
}