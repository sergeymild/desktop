import * as React from 'react'
import { IStashItem } from './stashes-sidebar-list-view'
import { Octicon, OcticonSymbol } from '../octicons'

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
    <div className="stash-list-item" data-name={item.stash.name} onContextMenu={handleContextMenu}>
      <div className="info">
        <div className="summary" title={item.stash.name}>
          {item.stash.name}
        </div>
        <div className="description">
          <Octicon className="icon" symbol={OcticonSymbol.tag}/>
          &nbsp;
          {item.stash.stashSha}
        </div>
      </div>
    </div>
  )
}