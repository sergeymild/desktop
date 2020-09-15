import * as React from 'react'
import { ICloneProgress } from '../models/progress'
import { Octicon, OcticonSymbol } from './octicons'
import { UiView } from './ui-view'

interface IProps {
  readonly repositoryName: string
  readonly progress: ICloneProgress
}

/** The component for displaying a cloning repository's progress. */
export const CloningRepositoryView: React.FC<IProps> = ({repositoryName, progress}) => {
  /* The progress element won't take null for an answer.
     * Only way to get it to be indeterminate is by using undefined */
  const progressValue = progress.value || undefined

  return (
    <UiView id="cloning-repository-view">
      <div className="title-container">
        <Octicon symbol={OcticonSymbol.desktopDownload} />
        <div className="title">Cloning {repositoryName}</div>
      </div>
      <progress value={progressValue} />
      <div className="details">{progress.description}</div>
    </UiView>
  )
}
