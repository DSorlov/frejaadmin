![stability-stable](https://img.shields.io/badge/stability-stable-green.svg)
![version](https://img.shields.io/badge/version-0.0.1-green.svg)
![maintained](https://img.shields.io/maintenance/yes/2022.svg)
[![maintainer](https://img.shields.io/badge/maintainer-daniel%20sörlöv-blue.svg)](https://github.com/DSorlov)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://img.shields.io/github/license/DSorlov/frejaadmin)

# frejaadmin
A minimalistic Freja eID Organisation ID administration service. Designed to run as a container. Using [eid-provider](https://github.com/DSorlov/eid-provider) 0.1.9 or later to integrate with Freja APIs. Prebuilt image availiable on [docker hub](https://hub.docker.com/r/dsorlov/frejaadmin)

## Run in docker
Create a directory to hold configuration and audit etc (ie everything you need to persist). When you start the first time it will create config files. Edit these and then restart the instance. On first run it is running the Freja eID demo key and using demo credentials. You will need to change the admin accounts.

```
docker run -d --name="frejaadmin" -v /PATH_TO_YOUR_CONFIG:/usr/src/frejaadmin/data -p 3180:3180 --net=host dsorlov/frejaadmin:latest
```

## Config directory (data)
- config.json: Main config file
- favicon.ico: If it exists it will be used, otherwise will use built in
- html: If it exist it will try and load templates first from here, then use the built in templates
- static: If it exists it will be mapped and servable on the server from /static
- pending: A temporary directory for pending files and data while issuing
- auditlogs: Output directory for all audit data

### Logging settings in config file
Auditing messages is a list of which categories to log. Marked with stars denotes standard logging.
- auth*: authentication data
- list: view list data
- orgid*: change orgid data
- user*: user management data
- log*: log management data
- viewlog: viewing of log

### Templates used by the app
- error_404.ejs
- error_403.ejs
- error_500.ejs
- adminform.js
- adminform.ejs
- frejaadmin.css
- frejaadmin.js
- loginform.js
- loginform.ejs

