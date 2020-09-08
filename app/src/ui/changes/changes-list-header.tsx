import * as React from 'react'
import { Checkbox } from '../lib/checkbox'
import { DiffSelectionType } from '../../models/diff'
import { WorkingDirectoryStatus } from '../../models/status'
import { getIncludeAllValue } from './changes-list'
import { RebaseConflictState } from '../../lib/app-state'

interface IProps {
  readonly onContextMenu: () => void
  readonly workingDirectory: WorkingDirectoryStatus
  readonly rebaseConflictState: RebaseConflictState | null
  readonly isCommitting: boolean
  readonly onIncludeAllChanged: (event: React.FormEvent<HTMLInputElement>) => void
}

export const ChangesListHeader: React.FC<IProps> = (
  {
    onContextMenu,
    workingDirectory,
    rebaseConflictState,
    isCommitting,
    onIncludeAllChanged
  }) => {

  const handleContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    onContextMenu()
  }

  const filesCount = workingDirectory.files.length

  const filesPlural = filesCount === 1 ? 'file' : 'files'
  const filesDescription = `${filesCount} changed ${filesPlural}`

  const selectedChangeCount = workingDirectory.files.filter(
    file => file.selection.getSelectionType() !== DiffSelectionType.None
  ).length
  const selectedFilesPlural = selectedChangeCount === 1 ? 'file' : 'files'
  const selectedChangesDescription = `${selectedChangeCount} changed ${selectedFilesPlural} selected`
  const includeAllValue = getIncludeAllValue(workingDirectory, rebaseConflictState)

  const disableAllCheckbox =
    filesCount === 0 ||
    isCommitting ||
    rebaseConflictState !== null

  return (
    <div
      className="header"
      onContextMenu={handleContextMenu}
      title={selectedChangesDescription}
    >
      <Checkbox
        label={filesDescription}
        value={includeAllValue}
        onChange={onIncludeAllChanged}
        disabled={disableAllCheckbox}
      />
    </div>
  )
}