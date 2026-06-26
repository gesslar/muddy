---@type Glu
local glu = require("__PKGNAME__/vendor/Glu-single")("__PKGNAME__")
local requiredVersion = "4.20.0"

__PKGNAME__ = __PKGNAME__ or {
  path = getMudletHomeDir(),
  watch = true,
  events = {}
}

---@param cons table Constructor arguments.
function __PKGNAME__:new(cons)
  local version = getMudletVersion("string")
  if glu.version.compare(version, requiredVersion) == -1 then
    debugc(
      "This __PKGNAME__ package requires at least version " .. requiredVersion
    )

    return
  end

  local ok, result

  ok, result = glu.table.associative(cons)
  if not ok then
    if result == false then
      debugc(
        "Error in constructor options passed to __PKGNAME__, or constructor " ..
        "options is not a table."
      )
    else
      debugc(
        "Error in constructor options passed to __PKGNAME__ " .. tostring(result)
      )
    end

    return
  end

  local instance = table.deepcopy(cons or {}) --[[@as table]]

  setmetatable(instance, self)
  self.__index = self

  ok, result = pcall(glu.fd.fix_path, instance.path)
  if not ok then
    debugc("Missing or invalid path in constructor: " .. result)

    return
  end

  instance.outputPath = instance.path .. "/.output"

  if instance.watch then instance:start() end

  return instance
end

function __PKGNAME__:start()
  self:stop()
  self.watch = true

  self.eventHandler = registerAnonymousEventHandler(
    "sysPathChanged",
    function(_, path)
      if path == self.outputPath then
        self:reload()
      end
    end
  )

  addFileWatch(self.outputPath)
end

function __PKGNAME__:stop()
  self.watch = false
  if self.eventHandler then
    killAnonymousEventHandler(self.eventHandler)
    self.eventHandler = nil
  end
  removeFileWatch(self.outputPath)
end

local function execute(item)
  if not item then
    debugc("Attempted to execute nil or false, must be string or function")

    return
  end

  local itype = type(item)
  if itype == "string" then
    local f, e = loadstring("return " .. item)
    if not f then
      f, e = loadstring(item)
    end
    if not f then
      debugc("Unable to convert string to function for execution in Muddy hook:" .. e)
      return
    end
    item = f
    itype = type(item)
  end
  if itype ~= "function" then
    debugc("Unable to execute item, need a function, got a " .. itype)
    return
  end
  local worked, err = pcall(item)
  if not worked then
    debugc("Error executing item: " .. tostring(err))
  end
end

local function _uninstall(self, name, pre, post)
  debugc("preremove " .. name)
  if pre then
    debugc(f "  Firing preremove for pkg: {name}")
    execute(pre)
    debugc(f "  END preremove for pkg: {name}")
  end

  local succ = uninstallPackage(name)
  if not succ then
    debugc("Could not uninstall package at " .. name)

    if self.uninstallHandle then
      killAnonymousEventHandler(self.uninstallHandle)
    end

    return
  end

  debugc("postremove " .. name)
  if post then
    debugc(f "  Firing postremove for pkg: {name}")
    execute(post)
    debugc(f "  END postremove for pkg: {name}")
  end

  raiseEvent("__PKGNAME__:uninstalled", name)
end

local function _install(self, name, path, pre, post)
  debugc("preinstall " .. name)
  if pre then
    debugc(f "  Firing preinstall for pkg: {name}")
    execute(pre)
    debugc(f "  END preinstall for pkg: {name}")
  end

  local succ = installPackage(path)
  if not succ then
    debugc("Could not install package at " .. path)

    if self.installHandle then
      killAnonymousEventHandler(self.installHandle)
    end

    return
  end

  debugc("postinstall " .. name)
  if post then
    debugc(f "  Firing postinstall for pkg: {name}")
    execute(post)
    debugc(f "  END postinstall for pkg: {name}")
  end

  raiseEvent("__PKGNAME__:installed", name)
end

function __PKGNAME__:reload()
  local ok, result, err, output

  ok, result, err = pcall(glu.fd.read_json, self.outputPath)

  if not ok then
    debugc("Missing or invalid output file, err: " .. tostring(result))
    return
  end

  if result == nil then
    debugc("Error loading output file, err: " .. tostring(err))
    return
  end

  result = result --[[@as table]]

  ok, output = pcall(glu.table.associative, result)
  if not ok or output == false then
    debugc("Invalid data format in '" .. self.outputPath .. "'")

    return
  end

  local name = result.name
  if type(name) ~= "string" then
    debugc("Missing or invalid package name in '" .. self.outputPath .. "'")

    return
  end

  local path = self.path .. result.path -- the result of the build
  ok, path = pcall(glu.fd.fix_path, path)
  if not ok then
    debugc("Invalid path in '" .. self.path .. "', or '" .. self.outputPath .. "'")

    return
  end

  ok, result = pcall(glu.fd.file_exists, path)
  if not ok or result == false then
    debugc("Invalid or missing package path in '" .. self.outputPath .. "'")

    return
  end

  local
    prer, postr, prei, posti
    =
    self.preremove, self.postremove, self.preinstall, self.postinstall

  self.uninstallHandle = registerAnonymousEventHandler(
    "__PKGNAME__:uninstalled",
    function(_, uninstalledName)
      if uninstalledName ~= name then return true end

      self.installHandle = registerAnonymousEventHandler(
        "__PKGNAME__:installed",
        function(_, installedName)
          if installedName ~= name then return true end

          debugc("Done reloading pkg " .. name)
        end,
        true
      )

      _install(self, name, path, prei, posti)
    end,
    true
  )

  _uninstall(self, name, prer, postr)
end
