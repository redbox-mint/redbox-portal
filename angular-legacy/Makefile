help:
	    @echo "_______BUILD ANGULAR FRONTEND______\n"
	    @echo "To build all apps run make make build-frontend"

build-frontend:
			@echo "Building record_search"
			node_modules/.bin/ng build -a=0 --extract-css true
			@echo "Building dmp"
			node_modules/.bin/ng build -a=1 --extract-css true

build-frontend-prod:
			@echo "Building record_search"
			node_modules/.bin/ng build -a=0 --prod --build-optimizer --output-hashing=none --extract-css true
			@echo "Building dmp"
			node_modules/.bin/ng build -a=1 --prod --build-optimizer --output-hashing=none --extract-css true

build-frontend-prod-sourcemaps:
			@echo "Building record_search"
			node_modules/.bin/ng build -a=0 --prod --build-optimizer --output-hashing=none --sourcemaps=true --extract-css true
			@echo "Building dmp"
			node_modules/.bin/ng build -a=1 --prod --build-optimizer --output-hashing=none --sourcemaps=true --extract-css true
