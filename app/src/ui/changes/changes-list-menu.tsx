import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import classNames from 'classnames'

interface IProps {
  readonly stashChanges: () => void
  readonly discardChanges: () => void
  readonly filesCount: number
}

export const ChangesListMenu: React.FC<IProps> = (
  {
    stashChanges,
    discardChanges,
    filesCount
  }) => {

  return (<div className="changes-list-menu">
    <span
      title={'Stash changes'}
      onClick={filesCount === 0 ? undefined : stashChanges}
      className={classNames({disabled: filesCount === 0})}
    >
      <Octicon symbol={OcticonSymbol.stash}/>
      Stash
    </span>
    <span
      title={'Discard changes'}
      onClick={filesCount === 0 ? undefined : discardChanges}
      className={classNames({disabled: filesCount === 0}, 'warning')}>
      <Octicon symbol={OcticonSymbol.remove}/>
      Discard
    </span>
  </div>)
}