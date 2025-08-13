rm -Rf core/generated
mkdir -p core/generated

cd proto
# Generating go code for only login proto. agent.proto is consumed from agent-boot
protoc --go_out=../core/generated --go_opt=paths=source_relative \
    --go-grpc_out=../core/generated --go-grpc_opt=paths=source_relative \
    login.proto

cd ../core
ls -l
go build -o ../build/medicine-rag .