---@type Glu
local glu = require("Muddy/vendor/Glu-single")("Muddy")
local validEvents = {
  "preremove", "postremove",
  "preinstall", "postinstall"
}

Muddy = Muddy or {
  path = getMudletHomeDir(),
  watch = true,
  events = {}
}

---@param cons table Constructor arguments.
function Muddy:new(cons)
  local ok, result

  ok, result = glu.table.associative(cons)
  if not ok or result == false then
    debugc(
      "Error in constructor options passed to Muddy, or constructor " ..
      "options is not a table: " .. result
    )

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

function Muddy:start()
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

function Muddy:stop()
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
      debugc("Unable to convert string to function for execution in Muddler hook:" .. e)
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

local function _uninstall(name, pre, post)
  debugc("preremove " .. name)
  if prer then
    debugc(f "  Firing preremove for pkg: {name}")
    pcall(execute, pre)
    debugc(f "  END premove for pkg: {name}")
  end

  uninstallPackage(name)

  debugc("postremove " .. name)
  if postr then
    debugc(f "  Firing postremove for pkg: {name}")
    pcall(execute, post)
    debugc(f "  END postmove for pkg: {name}")
  end

  raiseEvent("muddy:uninstalled", name)
end

local function _install(name, path, pre, post)
  debugc("preinstall " .. name)
  if prei then
    debugc(f "  Firing preinstall for pkg: {name}")
    pcall(execute, pre)
    debugc(f "  END preinstall for pkg: {name}")
  end

  local succ = installPackage(path)
  if not succ then
    debugc("Could not install package at " .. path)

    return
  end

  debugc("postinstall " .. name)
  if posti then
    debugc(f "  Firing postinstall for pkg: {name}")
    pcall(execute, post)
    debugc(f "  END postinstall for pkg: {name}")
  end
end

function Muddy:reload()
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

  local ok, err

  registerAnonymousEventHandler("muddy:uninstalled", function(_, uninstalledName)
    if uninstalledName ~= name then return end

    registerAnonymousEventHandler("muddy:installed", function(_, installedName)
      if installedName ~= name then return end

      debugc("Done reloading pkg " .. name)
    end, true)

    _install(name, path, prei, posti)
  end, true)

  _uninstall(name, prer, postr)
end
