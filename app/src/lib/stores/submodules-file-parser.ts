export interface ISubModuleDetails {
  submodule: string
  path: string
  branch: string
  url: string
}

export const parseGitModules = (data: string): ReadonlyArray<ISubModuleDetails> => {
  const gitModules = data.split("[")
  const subModulesCollections: Array<ISubModuleDetails> = [];
  gitModules.forEach(submodules => {
    if (/^submodule*/.test(submodules)) {
      const submodule = submodules.split("\n\t")
      const moduleDetails: ISubModuleDetails = {
        branch: "",
        path: "",
        url: "",
        submodule: ""
      };

      submodule.forEach(sub => {

        const sub1 = sub.replace(/\n/g,'').replace(/\s/g,'').replace(/\"/g,'=');
        const parseSubmoduleDetails = sub1.split("=");

        switch(parseSubmoduleDetails[0]) {
          case "submodule":
            moduleDetails.submodule = parseSubmoduleDetails[1];
            break;
          case "path":
            moduleDetails.path = parseSubmoduleDetails[1];
            break;
          case "branch":
            moduleDetails.branch = parseSubmoduleDetails[1];
            break;
          case "url":
            moduleDetails.url = parseSubmoduleDetails[1];
            break;
        }
      })
      subModulesCollections.push(moduleDetails);
    }

  })

  return subModulesCollections
}