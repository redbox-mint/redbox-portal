group "default" {
  targets = ["runtime", "test"]
}
target "runtime" {
  context = "."
  dockerfile = "Dockerfile"
  target = "runtime"
  tags = ["redbox-portal:runtime"]
  output = ["type=docker"]
}
target "test" {
  inherits = ["runtime"]
  target = "test"
  tags = ["redbox-portal:test"]
}
