import * as React from 'react'
import { IStashItem } from './stashes-sidebar-list-view'
import { Octicon, OcticonSymbol } from '../octicons'
import { RelativeTime } from '../relative-time'

interface IStashListItemProps {
  item: IStashItem
  onContextMenu: (item: IStashItem) => void
}

export const StashListItem: React.FC<IStashListItemProps> = ({ item, onContextMenu }) => {
  const handleContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    onContextMenu(item)
  }

  return (
    <div className="stash-list-item" onContextMenu={handleContextMenu}>
      <div className="info">
        <div className="summary" title={item.stash.uiName}>
          {item.stash.uiName}
        </div>
        <div className="description">
          <Octicon className="icon" symbol={OcticonSymbol.stashIcon}/>
          <span className="stash-sha">{item.stash.stashSha}</span>
          {<RelativeTime date={new Date(item.stash.createdAt * 1000)} abbreviate={true} />}
        </div>
      </div>
    </div>
  )
}