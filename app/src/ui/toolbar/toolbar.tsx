import * as React from 'react'

interface IProps {
  readonly id?: string
}

/** The main application toolbar component. */
export const Toolbar: React.FC<IProps> = ({id, children}) => {
  return (
    <div id={id} className="toolbar">
      {children}
    </div>
  )
}
